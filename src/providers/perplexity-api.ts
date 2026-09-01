import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';
import { toOpenAiEffort } from '../effort.js';

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

// Perplexity-native (web-search) models - owned_by "perplexity".
// Pricing list (docs.perplexity.ai, 2026-08): sonar, sonar-pro,
// sonar-reasoning-pro, sonar-deep-research. Dropped bare sonar-reasoning.
const SONAR_MODELS = [
  'sonar',
  'sonar-pro',
  'sonar-reasoning-pro',
  'sonar-deep-research',
];

// Upstream models proxied through Perplexity Agent API (changelog Jul 2026).
// owned_by is the first path segment.
const PROXIED_MODELS = [
  'perplexity/deepseek-v4-flash-0731',
  'perplexity/deepseek-v4-pro-0813',
  'perplexity/glm-5.2',
  'perplexity/glm-5.3',
  'perplexity/kimi-k2.7-code',
  'perplexity/kimi-k3',
  'perplexity/nemotron-3-ultra-550b-a55b',
  'perplexity/nemotron-3.5-lightning-30b-a3b',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'xai/grok-4.5',
  'xai/grok-4.6',
  'xai/grok-4.20-reasoning',
  'xai/grok-4.20-non-reasoning',
  'xai/grok-4.20-multi-agent',
  'google/gemini-3.6-flash',
  'google/gemini-3.7-flash',
  'google/gemini-3.5-flash',
  'google/gemini-3.5-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.1-pro-preview',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5.1',
  'openai/gpt-5.2',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai/gpt-5.4-nano',
  'openai/gpt-5.5',
];

export class PerplexityApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'perplexity-api';

  readonly models: ModelDefinition[] = [
    ...SONAR_MODELS.map(id => ({
      id: `${PREFIX}${id}`,
      provider: 'perplexity-api' as ProviderName,
      displayName: `${id} (Perplexity)`,
      owned_by: 'perplexity',
      availability: 'verified' as const,
      source: 'perplexity-api',
    })),
    ...PROXIED_MODELS.map(id => ({
      id: `${PREFIX}${id}`,
      provider: 'perplexity-api' as ProviderName,
      displayName: `${id} (Perplexity)`,
      owned_by: id.split('/')[0] ?? 'perplexity',
      availability: 'documented' as const,
      source: 'perplexity-model-catalog',
    })),
  ];

  /** Route any "api-perplexity/…" model here, even if not in the curated catalog. */
  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async refreshModels(): Promise<number> {
    return this.refreshModelCatalog(`${PERPLEXITY_BASE_URL}/models`, PREFIX);
  }

  private _client(): OpenAI {
    return new OpenAI({ apiKey: this.apiKey, baseURL: PERPLEXITY_BASE_URL });
  }

  private _toApiModel(pluginId: string): string {
    return pluginId.startsWith(PREFIX) ? pluginId.slice(PREFIX.length) : pluginId;
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    const reasoning_effort = toOpenAiEffort(req.effort);
    const response = await client.chat.completions.create({
      model: this._toApiModel(req.model),
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      // Pass through for proxied reasoning models; Sonar may ignore unknown fields.
      ...(reasoning_effort ? { reasoning_effort } : {}),
    }, { signal: req.signal });
    return response.choices[0]?.message?.content ?? '';
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    const reasoning_effort = toOpenAiEffort(req.effort);
    const stream = await client.chat.completions.create({
      model: this._toApiModel(req.model),
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(reasoning_effort ? { reasoning_effort } : {}),
    }, { signal: req.signal });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
