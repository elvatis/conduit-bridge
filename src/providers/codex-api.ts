import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';
import { toOpenAiEffort } from '../effort.js';

// Model IDs verified against developers.openai.com/api/docs/models (2026-08-09).
// GPT-5.6 family: Sol (flagship, alias gpt-5.6), Terra (balanced), Luna (cost).
// Prior generation gpt-5.5 / gpt-5.5-pro remain available. Dropped from the
// curated catalog: gpt-5.4* (superseded), effort-label IDs, o3, codex-mini.
const MODEL_MAP: Record<string, string> = {
  'api-codex/gpt-5.6-sol':   'gpt-5.6-sol',
  'api-codex/gpt-5.6-terra': 'gpt-5.6-terra',
  'api-codex/gpt-5.6-luna':  'gpt-5.6-luna',
  'api-codex/gpt-5.6':       'gpt-5.6', // alias -> Sol
  'api-codex/gpt-5.5':       'gpt-5.5',
  'api-codex/gpt-5.5-pro':   'gpt-5.5-pro',
};

export class CodexApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'codex-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-codex/gpt-5.6-sol',   provider: 'codex-api', displayName: 'GPT-5.6 Sol (API)',   owned_by: 'openai' },
    { id: 'api-codex/gpt-5.6-terra', provider: 'codex-api', displayName: 'GPT-5.6 Terra (API)', owned_by: 'openai' },
    { id: 'api-codex/gpt-5.6-luna',  provider: 'codex-api', displayName: 'GPT-5.6 Luna (API)',  owned_by: 'openai' },
    { id: 'api-codex/gpt-5.5',       provider: 'codex-api', displayName: 'GPT-5.5 (API)',       owned_by: 'openai' },
    { id: 'api-codex/gpt-5.5-pro',   provider: 'codex-api', displayName: 'GPT-5.5 Pro (API)',   owned_by: 'openai' },
  ];

  private _client(): OpenAI {
    return new OpenAI({ apiKey: this.apiKey });
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const reasoning_effort = toOpenAiEffort(req.effort);
    const response = await client.chat.completions.create({
      model: apiModel,
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(reasoning_effort ? { reasoning_effort } : {}),
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const reasoning_effort = toOpenAiEffort(req.effort);
    const stream = await client.chat.completions.create({
      model: apiModel,
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(reasoning_effort ? { reasoning_effort } : {}),
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
