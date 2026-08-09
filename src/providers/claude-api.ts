import Anthropic from '@anthropic-ai/sdk';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

// Map friendly model IDs to Anthropic API model strings.
// Use the bare aliases (never date-suffixed): from Claude 4.6 onward IDs are
// dateless pinned snapshots. Verified platform.claude.com/docs/en/about-claude/models/overview
// (2026-08-09). Current line first (Fable 5, Opus 5, Sonnet 5, Haiku 4.5), then
// still-active previous Opus/Sonnet generations for callers that pin older ids.
const MODEL_MAP: Record<string, string> = {
  'api-claude/claude-fable-5':    'claude-fable-5',
  'api-claude/claude-opus-5':     'claude-opus-5',
  'api-claude/claude-sonnet-5':   'claude-sonnet-5',
  'api-claude/claude-haiku-4-5':  'claude-haiku-4-5',
  'api-claude/claude-opus-4-8':   'claude-opus-4-8',
  'api-claude/claude-opus-4-7':   'claude-opus-4-7',
  'api-claude/claude-opus-4-6':   'claude-opus-4-6',
  'api-claude/claude-sonnet-4-6': 'claude-sonnet-4-6',
  'api-claude/claude-sonnet-4-5': 'claude-sonnet-4-5',
};

// Default max output tokens per model (used when client doesn't specify)
// Sources: platform.claude.com/docs/en/about-claude/models/overview (2026-08)
const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'api-claude/claude-fable-5':    128_000,
  'api-claude/claude-opus-5':     128_000,
  'api-claude/claude-sonnet-5':   128_000,
  'api-claude/claude-haiku-4-5':   64_000,
  'api-claude/claude-opus-4-8':   128_000,
  'api-claude/claude-opus-4-7':   128_000,
  'api-claude/claude-opus-4-6':   128_000,
  'api-claude/claude-sonnet-4-6': 128_000,
  'api-claude/claude-sonnet-4-5':  64_000,
};

export class ClaudeApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'claude-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-claude/claude-fable-5',    provider: 'claude-api', displayName: 'Claude Fable 5 (API)',    owned_by: 'anthropic' },
    { id: 'api-claude/claude-opus-5',     provider: 'claude-api', displayName: 'Claude Opus 5 (API)',     owned_by: 'anthropic' },
    { id: 'api-claude/claude-sonnet-5',   provider: 'claude-api', displayName: 'Claude Sonnet 5 (API)',   owned_by: 'anthropic' },
    { id: 'api-claude/claude-haiku-4-5',  provider: 'claude-api', displayName: 'Claude Haiku 4.5 (API)',  owned_by: 'anthropic' },
    { id: 'api-claude/claude-opus-4-8',   provider: 'claude-api', displayName: 'Claude Opus 4.8 (API)',   owned_by: 'anthropic' },
    { id: 'api-claude/claude-opus-4-7',   provider: 'claude-api', displayName: 'Claude Opus 4.7 (API)',   owned_by: 'anthropic' },
    { id: 'api-claude/claude-opus-4-6',   provider: 'claude-api', displayName: 'Claude Opus 4.6 (API)',   owned_by: 'anthropic' },
    { id: 'api-claude/claude-sonnet-4-6', provider: 'claude-api', displayName: 'Claude Sonnet 4.6 (API)', owned_by: 'anthropic' },
    { id: 'api-claude/claude-sonnet-4-5', provider: 'claude-api', displayName: 'Claude Sonnet 4.5 (API)', owned_by: 'anthropic' },
  ];

  private _client(): Anthropic {
    return new Anthropic({ apiKey: this.apiKey });
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    // Separate system message from conversation messages
    const systemMsg = req.messages.find(m => m.role === 'system');
    const conversationMsgs = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await client.messages.create({
      model: apiModel,
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS[req.model] ?? 64_000,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: conversationMsgs,
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const systemMsg = req.messages.find(m => m.role === 'system');
    const conversationMsgs = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = client.messages.stream({
      model: apiModel,
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS[req.model] ?? 64_000,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: conversationMsgs,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
