import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';

const MODEL_MAP: Record<string, string> = {
  'api-gemini/gemini-2.5-pro':       'gemini-2.5-pro-preview-06-05',
  'api-gemini/gemini-2.5-flash':     'gemini-2.5-flash-preview-05-20',
  'api-gemini/gemini-2.0-flash':     'gemini-2.0-flash',
  'api-gemini/gemini-2.0-flash-lite':'gemini-2.0-flash-lite',
};

export class GeminiApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'gemini-api';

  readonly models: ModelDefinition[] = [
    { id: 'api-gemini/gemini-2.5-pro',        provider: 'gemini-api', displayName: 'Gemini 2.5 Pro (API)',        owned_by: 'google' },
    { id: 'api-gemini/gemini-2.5-flash',       provider: 'gemini-api', displayName: 'Gemini 2.5 Flash (API)',      owned_by: 'google' },
    { id: 'api-gemini/gemini-2.0-flash',       provider: 'gemini-api', displayName: 'Gemini 2.0 Flash (API)',      owned_by: 'google' },
    { id: 'api-gemini/gemini-2.0-flash-lite',  provider: 'gemini-api', displayName: 'Gemini 2.0 Flash Lite (API)', owned_by: 'google' },
  ];

  private _client(): GoogleGenerativeAI {
    return new GoogleGenerativeAI(this.apiKey!);
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const systemMsg = req.messages.find(m => m.role === 'system');
    const model = client.getGenerativeModel({
      model: apiModel,
      ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
    }, {
      ...(req.max_tokens ? { maxOutputTokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    } as any);

    // Convert messages to Gemini format (history + last user message)
    const conversationMsgs = req.messages.filter(m => m.role !== 'system');
    const history = conversationMsgs.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const lastMsg = conversationMsgs[conversationMsgs.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMsg.content);
    return result.response.text();
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const client = this._client();
    const apiModel = MODEL_MAP[req.model] ?? req.model;

    const systemMsg = req.messages.find(m => m.role === 'system');
    const model = client.getGenerativeModel({
      model: apiModel,
      ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
    }, {
      ...(req.max_tokens ? { maxOutputTokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    } as any);

    const conversationMsgs = req.messages.filter(m => m.role !== 'system');
    const history = conversationMsgs.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const lastMsg = conversationMsgs[conversationMsgs.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMsg.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}
