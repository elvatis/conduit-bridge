import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

// Perplexity exposes an OpenAI-compatible /chat/completions endpoint. Alongside
// its own web-grounded "sonar" models it proxies many upstream providers
// (Anthropic, OpenAI, xAI, Google) — all behind a single PERPLEXITY_API_KEY.
//
// Model ids are prefixed "api-perplexity/" in conduit-bridge and the prefix is
// stripped before the request goes out:
//   "api-perplexity/anthropic/claude-opus-4-8" → "anthropic/claude-opus-4-8"
//   "api-perplexity/sonar-pro"                 → "sonar-pro"
// Any "api-perplexity/<model>" is accepted (passthrough via ownsModel); the list
// below is just the curated catalog shown by /v1/models.
const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';
const PREFIX = 'api-perplexity/';

// Perplexity-native (web-search) models — owned_by "perplexity".
const SONAR_MODELS = [
  'sonar',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-reasoning-pro',
  'sonar-deep-research',
];

// Upstream models proxied through Perplexity — owned_by is the first path segment.
const PROXIED_MODELS = [
  'anthropic/claude-opus-4-8',
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5.5',
  'openai/gpt-5.4',
  'xai/grok-4.5',
  'google/gemini-2.5-pro',
];

export class PerplexityApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'perplexity-api';

  readonly models: ModelDefinition[] = [
    ...SONAR_MODELS.map(id => ({
      id: `${PREFIX}${id}`,
      provider: 'perplexity-api' as ProviderName,
      displayName: `${id} (Perplexity)`,
      owned_by: 'perplexity',
    })),
    ...PROXIED_MODELS.map(id => ({
      id: `${PREFIX}${id}`,
      provider: 'perplexity-api' as ProviderName,
      displayName: `${id} (Perplexity)`,
      owned_by: id.split('/')[0] ?? 'perplexity',
    })),
  ];

  /** Route any "api-perplexity/…" model here, even if not in the curated catalog. */
  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  private _client(): OpenAI {
    return new OpenAI({ apiKey: this.apiKey, baseURL: PERPLEXITY_BASE_URL });
  }

  private _toApiModel(pluginId: string): string {
    return pluginId.startsWith(PREFIX) ? pluginId.slice(PREFIX.length) : pluginId;
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    const response = await client.chat.completions.create({
      model: this._toApiModel(req.model),
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    const stream = await client.chat.completions.create({
      model: this._toApiModel(req.model),
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
