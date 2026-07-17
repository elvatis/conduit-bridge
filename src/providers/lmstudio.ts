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

interface LmStudioApiModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export class LmStudioProvider implements ProviderAdapter {
  readonly name: ProviderName = 'lmstudio';

  private readonly _cfg: BridgeConfig;
  private _discovered: ModelDefinition[] = [];

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
  }

  private get _baseUrl(): string {
    const raw = process.env.LM_STUDIO_URL || this._cfg.lmStudioUrl || DEFAULT_URL;
    return raw.replace(/\/+$/, '');
  }

  get models(): ModelDefinition[] {
    // Always advertise "auto"; append any models discovered from a reachable server.
    return [
      {
        id: 'lmstudio/auto',
        provider: 'lmstudio',
        displayName: 'LM Studio (active model)',
        owned_by: 'lmstudio',
      },
      ...this._discovered,
    ];
  }

  /** Route any "lmstudio/…" model here, even before discovery has populated the list. */
  ownsModel(modelId: string): boolean {
    return modelId === 'lmstudio/auto' || modelId.startsWith(PREFIX);
  }

  /** Query LM Studio for its currently loaded models. Returns [] if unreachable. */
  private async _discover(timeoutMs = 5000): Promise<ModelDefinition[]> {
    try {
      const resp = await fetch(`${this._baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) return this._discovered;
      const data = (await resp.json()) as { data?: LmStudioApiModel[] };
      this._discovered = (data.data ?? []).map(m => ({
        id: `${PREFIX}${m.id}`,
        provider: 'lmstudio' as ProviderName,
        displayName: `${m.id} (LM Studio)`,
        owned_by: m.owned_by ?? 'lmstudio',
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
    const raw = pluginId.startsWith(PREFIX) ? pluginId.slice(PREFIX.length) : pluginId;
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
      signal: AbortSignal.timeout(req.max_tokens ? 300_000 : 120_000),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => resp.statusText);
      throw new Error(`LM Studio error ${resp.status}: ${errBody}`);
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const resp = await fetch(`${this._baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this._body(req, true),
      signal: AbortSignal.timeout(req.max_tokens ? 300_000 : 120_000),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => resp.statusText);
      throw new Error(`LM Studio error ${resp.status}: ${errBody}`);
    }
    if (!resp.body) {
      throw new Error('LM Studio: no response body for streaming request');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
          if (payload === '[DONE]') return;
          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // skip malformed SSE chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
