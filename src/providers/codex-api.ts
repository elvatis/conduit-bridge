import OpenAI from 'openai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

const MODEL_MAP: Record<string, string> = {
  'api-codex/gpt-5.4-pro':           'gpt-5.4-pro',
  'api-codex/gpt-5.4-thinking':      'gpt-5.4-thinking',
  'api-codex/gpt-5.3-instant':       'gpt-5.3-instant',
  'api-codex/gpt-5-thinking-mini':   'gpt-5-thinking-mini',
  'api-codex/o3':                    'o3',
  'api-codex/codex-mini':           'codex-mini-latest',
};

export class CodexApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'codex-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-codex/gpt-5.4-pro',          provider: 'codex-api', displayName: 'GPT-5.4 Pro (API)',          owned_by: 'openai' },
    { id: 'api-codex/gpt-5.4-thinking',     provider: 'codex-api', displayName: 'GPT-5.4 Thinking (API)',     owned_by: 'openai' },
    { id: 'api-codex/gpt-5.3-instant',      provider: 'codex-api', displayName: 'GPT-5.3 Instant (API)',      owned_by: 'openai' },
    { id: 'api-codex/gpt-5-thinking-mini',  provider: 'codex-api', displayName: 'GPT-5 Thinking Mini (API)',  owned_by: 'openai' },
    { id: 'api-codex/o3',                   provider: 'codex-api', displayName: 'o3 (API)',                   owned_by: 'openai' },
    { id: 'api-codex/codex-mini',           provider: 'codex-api', displayName: 'Codex Mini (API)',           owned_by: 'openai' },
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
