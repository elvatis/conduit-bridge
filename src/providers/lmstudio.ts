import type {
  BridgeConfig,
  ProviderName,
  ChatRequest,
  ChatMessage,
  ModelDefinition,
  ProviderAdapter,
} from '../types.js';
import { logger } from '../logger.js';

// LM Studio runs a local, OpenAI-compatible server (default http://127.0.0.1:1234)
// with no authentication. Models are discovered dynamically from /v1/models —
// whatever the user currently has loaded — and exposed as "lmstudio/<model-id>".
// "lmstudio/auto" lets LM Studio pick whichever model is loaded (model field omitted).
//
// Override the endpoint with the LM_STUDIO_URL env var or config.lmStudioUrl.
// Docs: https://lmstudio.ai/docs/api/openai-api
const DEFAULT_URL = 'http://127.0.0.1:1234';
const PREFIX = 'lmstudio/';

/** Incremental reasoning filter; incomplete tags stay buffered and unfinished reasoning is discarded. */
export class ThinkTagFilter {
  private pending = '';
  private thinking = false;
  /** Accept a transport chunk without exposing reasoning or partial tag prefixes. */
  push(chunk: string, final = false): string {
    this.pending += chunk;
    let output = '';
    while (this.pending) {
      const marker = this.thinking ? '</think>' : '<think>';
      const index = this.pending.toLowerCase().indexOf(marker);
      if (index >= 0) {
        if (!this.thinking) output += this.pending.slice(0, index);
        this.pending = this.pending.slice(index + marker.length); this.thinking = !this.thinking;
        continue;
      }
      let keep = 0;
      if (!final) for (let length = 1; length < marker.length; length++) if (this.pending.toLowerCase().endsWith(marker.slice(0, length))) keep = length;
      if (!this.thinking) output += this.pending.slice(0, this.pending.length - keep);
      this.pending = keep ? this.pending.slice(-keep) : '';
      break;
    }
    return output;
  }
}
/** Strip reasoning blocks from a complete local model answer. */
export function stripThinkTags(value: string): string { return new ThinkTagFilter().push(value, true); }

/** Configuration shared by local OpenAI-compatible providers. */
export interface LocalProviderOptions { name: ProviderName; prefix: string; defaultUrl: string; environment: string; label: string }

interface LmStudioApiModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export class LmStudioProvider implements ProviderAdapter {
  readonly name: ProviderName;

  private readonly _cfg: BridgeConfig;
  private _discovered: ModelDefinition[] = [];

  constructor(cfg: BridgeConfig, protected readonly local: LocalProviderOptions = { name: 'lmstudio', prefix: PREFIX, defaultUrl: DEFAULT_URL, environment: 'LM_STUDIO_URL', label: 'LM Studio' }) {
    this._cfg = cfg;
    this.name = local.name;
  }

  private get _baseUrl(): string {
    const raw = process.env[this.local.environment] || (this.name === 'lmstudio' ? this._cfg.lmStudioUrl : undefined) || this.local.defaultUrl;
    return raw.replace(/\/+$/, '');
  }

  get models(): ModelDefinition[] {
    // Always advertise "auto"; append any models discovered from a reachable server.
    return [
      {
        id: `${this.local.prefix}auto`,
        provider: this.name,
        displayName: `${this.local.label} (active model)`,
        owned_by: this.name,
      },
      ...this._discovered,
    ];
  }

  /** Route any "lmstudio/…" model here, even before discovery has populated the list. */
  ownsModel(modelId: string): boolean {
    return modelId.startsWith(this.local.prefix);
  }

  /** Query LM Studio for its currently loaded models. Returns [] if unreachable. */
  private async _discover(timeoutMs = 5000): Promise<ModelDefinition[]> {
    try {
      const resp = await fetch(`${this._baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) return this._discovered;
      const data = (await resp.json()) as { data?: LmStudioApiModel[] };
      // Skip embedding-only models so /v1/models stays chat-usable.
      this._discovered = (data.data ?? [])
        .filter(m => !/embed/i.test(m.id))
        .map(m => ({
          id: `${this.local.prefix}${m.id}`,
          provider: this.name,
          displayName: `${m.id} (${this.local.label})`,
          owned_by: m.owned_by ?? this.name,
        }));
      return this._discovered;
    } catch {
      return this._discovered;
    }
  }

  async checkSession(): Promise<boolean> {
    try {
      const resp = await fetch(`${this._baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return false;
      // Opportunistically refresh the model catalog while we're connected.
      await this._discover(3000);
      return true;
    } catch {
      return false;
    }
  }

  async ensureConnected(): Promise<boolean> {
    return this.checkSession();
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'LM Studio needs no login — start its local server (Developer tab → Start Server) ' +
        `and, if it isn't on ${DEFAULT_URL}, set LM_STUDIO_URL.`,
    );
  }

  async logout(): Promise<void> {
    logger.info('[lmstudio] local server — nothing to disconnect');
  }

  /** "lmstudio/llama-3.1-8b" → "llama-3.1-8b"; "lmstudio/auto" → "" (server picks). */
  private _toApiModel(pluginId: string): string {
    const raw = pluginId.startsWith(this.local.prefix) ? pluginId.slice(this.local.prefix.length) : pluginId;
    return raw === 'auto' ? '' : raw;
  }

  private _body(req: ChatRequest, stream: boolean): string {
    const model = this._toApiModel(req.model);
    const body: Record<string, unknown> = {
      messages: req.messages.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
      stream,
    };
    if (model) body.model = model; // omit for "auto" so LM Studio uses the loaded model
    if (req.max_tokens) body.max_tokens = req.max_tokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    return JSON.stringify(body);
  }

  async chat(req: ChatRequest): Promise<string> {
    const resp = await fetch(`${this._baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this._body(req, false),
      signal: AbortSignal.any([AbortSignal.timeout(req.max_tokens ? 300_000 : 120_000), ...(req.signal ? [req.signal] : [])]),
    });
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`${this.local.label} error ${resp.status}`);
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return stripThinkTags(data.choices?.[0]?.message?.content ?? '');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const resp = await fetch(`${this._baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this._body(req, true),
      signal: AbortSignal.any([AbortSignal.timeout(req.max_tokens ? 300_000 : 120_000), ...(req.signal ? [req.signal] : [])]),
    });
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`${this.local.label} error ${resp.status}`);
    }
    if (!resp.body) {
      throw new Error('LM Studio: no response body for streaming request');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const filter = new ThinkTagFilter();

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true });
        if (buffer.length > 1024 * 1024) throw new Error('Local model stream frame exceeds 1 MiB');

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
          if (payload === '[DONE]') { const tail = filter.push('', true); if (tail) yield tail; return; }
          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) { const visible = filter.push(delta); if (visible) yield visible; }
          } catch {
            // skip malformed SSE chunks
          }
        }
        if (done) break;
      }
      const tail = filter.push('', true); if (tail) yield tail;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
