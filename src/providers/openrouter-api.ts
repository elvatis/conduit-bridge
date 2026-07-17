import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

// OpenRouter is an OpenAI-compatible aggregator that fronts hundreds of models
// from Anthropic, OpenAI, Google, xAI, DeepSeek, Meta, Mistral, Qwen, and more —
// all behind a single API key (OPENROUTER_API_KEY, sk-or-v1-…).
//
// Model ids are prefixed "api-openrouter/" in conduit-bridge and the prefix is
// stripped before the request goes out:
//   "api-openrouter/anthropic/claude-opus-4-8" → "anthropic/claude-opus-4-8"
// Any "api-openrouter/<provider>/<model>" is accepted (passthrough via ownsModel);
// the list below is just the curated catalog shown by /v1/models.
//
// Docs: https://openrouter.ai/docs/api-reference/chat-completions
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PREFIX = 'api-openrouter/';

// Optional attribution headers (surface conduit-bridge on OpenRouter dashboards).
const OPENROUTER_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://github.com/elvatis/conduit-bridge',
  'X-Title': 'conduit-bridge',
};

const CATALOG = [
  'anthropic/claude-opus-4-8',
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5.5',
  'openai/gpt-5.4',
  'openai/o3',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'x-ai/grok-4.5',
  'x-ai/grok-3',
  'deepseek/deepseek-r1',
  'deepseek/deepseek-chat',
  'meta-llama/llama-4-maverick',
  'mistralai/mistral-large-2411',
  'qwen/qwen-2.5-72b-instruct',
];

export class OpenRouterApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'openrouter-api';

  readonly models: ModelDefinition[] = CATALOG.map(id => ({
    id: `${PREFIX}${id}`,
    provider: 'openrouter-api' as ProviderName,
    displayName: `${id} (OpenRouter)`,
    owned_by: id.split('/')[0] ?? 'openrouter',
  }));

  /** Route any "api-openrouter/…" model here, even if not in the curated catalog. */
  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  private _client(): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: OPENROUTER_HEADERS,
    });
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
