import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

const MODEL_MAP: Record<string, string> = {
  'api-codex/gpt-4.1':         'gpt-4.1',
  'api-codex/gpt-4.1-mini':    'gpt-4.1-mini',
  'api-codex/gpt-4.1-nano':    'gpt-4.1-nano',
  'api-codex/o3':              'o3',
  'api-codex/o4-mini':         'o4-mini',
  'api-codex/codex-mini':      'codex-mini-latest',
};

export class CodexApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'codex-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-codex/gpt-4.1',       provider: 'codex-api', displayName: 'GPT-4.1 (API)',       owned_by: 'openai' },
    { id: 'api-codex/gpt-4.1-mini',  provider: 'codex-api', displayName: 'GPT-4.1 Mini (API)',  owned_by: 'openai' },
    { id: 'api-codex/gpt-4.1-nano',  provider: 'codex-api', displayName: 'GPT-4.1 Nano (API)',  owned_by: 'openai' },
    { id: 'api-codex/o3',            provider: 'codex-api', displayName: 'o3 (API)',             owned_by: 'openai' },
    { id: 'api-codex/o4-mini',       provider: 'codex-api', displayName: 'o4-mini (API)',        owned_by: 'openai' },
    { id: 'api-codex/codex-mini',    provider: 'codex-api', displayName: 'Codex Mini (API)',     owned_by: 'openai' },
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
