import Anthropic from '@anthropic-ai/sdk';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';
import { toClaudeEffort } from '../effort.js';
import { logger } from '../logger.js';
import { stripPrefix } from './cli-util.js';

// Map friendly model IDs to Anthropic API model strings.
// Bare aliases (never date-suffixed). Curated: Fable 5, Opus 5, Sonnet 5, Haiku 4.5
// (platform.claude.com/docs/en/about-claude/models/overview, 2026-08).
const MODEL_MAP: Record<string, string> = {
  'api-claude/claude-fable-5':   'claude-fable-5',
  'api-claude/claude-opus-5':    'claude-opus-5',
  'api-claude/claude-sonnet-5':  'claude-sonnet-5',
  'api-claude/claude-haiku-4-5': 'claude-haiku-4-5',
};

// Default max output tokens per model (used when client doesn't specify)
const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'api-claude/claude-fable-5':   128_000,
  'api-claude/claude-opus-5':    128_000,
  'api-claude/claude-sonnet-5':  128_000,
  'api-claude/claude-haiku-4-5':  64_000,
};

const PREFIX = 'api-claude/';

/**
 * Anthropic's documented model list. Unlike the OpenAI-shaped catalogs the base
 * class handles, this one authenticates with `x-api-key` (not Bearer), requires
 * `anthropic-version`, and returns `{ data: [{ id, display_name }] }`.
 * Docs: platform.claude.com/docs/en/api/models-list
 */
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models?limit=1000';

/** Pull id/display_name out of an Anthropic models-list body. */
export function parseAnthropicModels(body: unknown): Array<{ id: string; displayName?: string }> {
  const list = (body as { data?: unknown })?.data;
  if (!Array.isArray(list)) return [];
  const out: Array<{ id: string; displayName?: string }> = [];
  const seen = new Set<string>();
  for (const item of list) {
    const id = (item as { id?: unknown })?.id;
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) continue;
    seen.add(id);
    const dn = (item as { display_name?: unknown })?.display_name;
    out.push({
      id: id.trim(),
      displayName: typeof dn === 'string' && dn.trim() ? dn.trim() : undefined,
    });
  }
  return out;
}

export class ClaudeApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'claude-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-claude/claude-fable-5',   provider: 'claude-api', displayName: 'Claude Fable 5 (API)',   owned_by: 'anthropic' },
    { id: 'api-claude/claude-opus-5',    provider: 'claude-api', displayName: 'Claude Opus 5 (API)',    owned_by: 'anthropic' },
    { id: 'api-claude/claude-sonnet-5',  provider: 'claude-api', displayName: 'Claude Sonnet 5 (API)',  owned_by: 'anthropic' },
    { id: 'api-claude/claude-haiku-4-5', provider: 'claude-api', displayName: 'Claude Haiku 4.5 (API)', owned_by: 'anthropic' },
  ];

  /** Replace the shipped list with what the account can actually call. */
  async refreshModels(): Promise<number> {
    if (!this.apiKey) return 0;
    try {
      const response = await fetch(ANTHROPIC_MODELS_URL, {
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = parseAnthropicModels(await response.json());
      if (!remote.length) return this.models.length;
      this.models.splice(0, this.models.length, ...remote.map(m => ({
        id: PREFIX + m.id,
        provider: this.name,
        displayName: `${m.displayName ?? m.id} (API)`,
        owned_by: 'anthropic',
        availability: 'verified' as const,
        source: 'provider-api',
      })));
      logger.info(`[claude-api] refreshed ${remote.length} models from provider catalog`);
      return remote.length;
    } catch (err) {
      logger.warn(`[claude-api] model catalog refresh failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private _client(): Anthropic {
    return new Anthropic({ apiKey: this.apiKey });
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    // A discovered id is not in MODEL_MAP, so fall back to stripping the prefix
    // rather than sending "api-claude/…" upstream as if it were a model name.
    const apiModel = MODEL_MAP[req.model] ?? stripPrefix(req.model, PREFIX);

    // Separate system message from conversation messages
    const systemMsg = req.messages.find(m => m.role === 'system');
    const conversationMsgs = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const effort = toClaudeEffort(req.effort);
    const response = await client.messages.create({
      model: apiModel,
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS[req.model] ?? 64_000,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      ...(effort ? { output_config: { effort } } : {}),
      messages: conversationMsgs,
    }, { signal: req.signal });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    // A discovered id is not in MODEL_MAP, so fall back to stripping the prefix
    // rather than sending "api-claude/…" upstream as if it were a model name.
    const apiModel = MODEL_MAP[req.model] ?? stripPrefix(req.model, PREFIX);

    const systemMsg = req.messages.find(m => m.role === 'system');
    const conversationMsgs = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const effort = toClaudeEffort(req.effort);
    const stream = client.messages.stream({
      model: apiModel,
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS[req.model] ?? 64_000,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      ...(effort ? { output_config: { effort } } : {}),
      messages: conversationMsgs,
    }, { signal: req.signal });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
