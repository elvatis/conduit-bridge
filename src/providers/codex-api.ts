import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

// Model IDs verified against developers.openai.com/api/docs/pricing and
// /codex/models (2026-07-01). GPT-5.5 / gpt-5.5-pro are the current flagships;
// Codex now defaults to the general gpt-5.5. Dropped: gpt-5.4-thinking /
// gpt-5.3-instant / gpt-5-thinking-mini (ChatGPT effort labels, not API IDs),
// o3 (retired from the current lineup), and codex-mini-latest (removed from the
// API on 2026-02-12; would 404).
const MODEL_MAP: Record<string, string> = {
  'api-codex/gpt-5.5':               'gpt-5.5',
  'api-codex/gpt-5.5-pro':           'gpt-5.5-pro',
  'api-codex/gpt-5.4':               'gpt-5.4',
  'api-codex/gpt-5.4-mini':          'gpt-5.4-mini',
  'api-codex/gpt-5.4-pro':           'gpt-5.4-pro',
};

export class CodexApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'codex-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-codex/gpt-5.5',              provider: 'codex-api', displayName: 'GPT-5.5 (API)',              owned_by: 'openai' },
    { id: 'api-codex/gpt-5.5-pro',          provider: 'codex-api', displayName: 'GPT-5.5 Pro (API)',          owned_by: 'openai' },
    { id: 'api-codex/gpt-5.4',              provider: 'codex-api', displayName: 'GPT-5.4 (API)',              owned_by: 'openai' },
    { id: 'api-codex/gpt-5.4-mini',         provider: 'codex-api', displayName: 'GPT-5.4 mini (API)',         owned_by: 'openai' },
    { id: 'api-codex/gpt-5.4-pro',          provider: 'codex-api', displayName: 'GPT-5.4 Pro (API)',          owned_by: 'openai' },
  ];

  private _client(): OpenAI {
    return new OpenAI({ apiKey: this.apiKey });
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const response = await client.chat.completions.create({
      model: apiModel,
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const stream = await client.chat.completions.create({
      model: apiModel,
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
