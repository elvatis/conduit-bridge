import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ProviderName, ChatRequest, ModelDefinition } from '../types.js';
import { ApiBaseProvider } from './api-base.js';
import { logger } from '../logger.js';
import { stripPrefix } from './cli-util.js';

// Model IDs verified against ai.google.dev/gemini-api/docs/models (2026-09-01).
// Gemini 3.7 Flash is the current Flash tier. gemini-3.1-pro remains
// a preview endpoint (gemini-3.1-pro-preview). Thinking is request config, not
// a separate model ID.
const MODEL_MAP: Record<string, string> = {
  'api-gemini/gemini-3.7-flash':      'gemini-3.7-flash',
  'api-gemini/gemini-3.6-flash':      'gemini-3.6-flash',
  'api-gemini/gemini-3.5-flash':      'gemini-3.5-flash',
  'api-gemini/gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
  'api-gemini/gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'api-gemini/gemini-3.1-pro':        'gemini-3.1-pro-preview',
};

const PREFIX = 'api-gemini/';

/**
 * Google's documented model list. Authenticates with the `x-goog-api-key`
 * header — deliberately not the `?key=` query form, which would put the
 * credential in a URL. Returns `{ models: [{ name: "models/…", displayName,
 * supportedGenerationMethods }] }`.
 * Docs: ai.google.dev/api/models#method:-models.list
 */
const GOOGLE_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';

/**
 * Pull the chat-capable models out of a Google models.list body.
 *
 * Names arrive as "models/gemini-3.7-flash" and are stripped to the bare id.
 * Anything that cannot do generateContent (embedders, retrieval helpers) is
 * dropped — advertising those would put non-chat models in the picker.
 */
export function parseGoogleModels(body: unknown): Array<{ id: string; displayName?: string }> {
  const list = (body as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  const out: Array<{ id: string; displayName?: string }> = [];
  const seen = new Set<string>();
  for (const item of list) {
    const name = (item as { name?: unknown })?.name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const methods = (item as { supportedGenerationMethods?: unknown })?.supportedGenerationMethods;
    if (Array.isArray(methods) && !methods.includes('generateContent')) continue;
    const id = name.trim().replace(/^models\//, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const dn = (item as { displayName?: unknown })?.displayName;
    out.push({ id, displayName: typeof dn === 'string' && dn.trim() ? dn.trim() : undefined });
  }
  return out;
}

export class GeminiApiProvider extends ApiBaseProvider {
  readonly name: ProviderName = 'gemini-api';

  /** Replace the shipped list with what this key can actually call. */
  async refreshModels(): Promise<number> {
    if (!this.apiKey) return 0;
    try {
      const response = await fetch(GOOGLE_MODELS_URL, {
        headers: { 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = parseGoogleModels(await response.json());
      if (!remote.length) return this.models.length;
      this.models.splice(0, this.models.length, ...remote.map(m => ({
        id: PREFIX + m.id,
        provider: this.name,
        displayName: `${m.displayName ?? m.id} (API)`,
        owned_by: 'google',
        availability: 'verified' as const,
        source: 'provider-api',
      })));
      logger.info(`[gemini-api] refreshed ${remote.length} models from provider catalog`);
      return remote.length;
    } catch (err) {
      logger.warn(`[gemini-api] model catalog refresh failed: ${(err as Error).message}`);
      return 0;
    }
  }

  readonly models: ModelDefinition[] = [
    { id: 'api-gemini/gemini-3.7-flash',      provider: 'gemini-api', displayName: 'Gemini 3.7 Flash (API)',      owned_by: 'google' },
    { id: 'api-gemini/gemini-3.6-flash',      provider: 'gemini-api', displayName: 'Gemini 3.6 Flash (API)',      owned_by: 'google' },
    { id: 'api-gemini/gemini-3.5-flash',      provider: 'gemini-api', displayName: 'Gemini 3.5 Flash (API)',      owned_by: 'google' },
    { id: 'api-gemini/gemini-3.5-flash-lite', provider: 'gemini-api', displayName: 'Gemini 3.5 Flash-Lite (API)', owned_by: 'google' },
    { id: 'api-gemini/gemini-3.1-flash-lite', provider: 'gemini-api', displayName: 'Gemini 3.1 Flash-Lite (API)', owned_by: 'google' },
    { id: 'api-gemini/gemini-3.1-pro',        provider: 'gemini-api', displayName: 'Gemini 3.1 Pro (API)',        owned_by: 'google' },
  ];

  private _client(): GoogleGenerativeAI {
    return new GoogleGenerativeAI(this.apiKey!);
  }

  async chat(req: ChatRequest): Promise<string> {
    const client = this._client();
    // A discovered id is not in MODEL_MAP; strip the prefix rather than sending
    // "api-gemini/…" upstream as if it were a model name.
    const apiModel = MODEL_MAP[req.model] ?? stripPrefix(req.model, PREFIX);

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
    // A discovered id is not in MODEL_MAP; strip the prefix rather than sending
    // "api-gemini/…" upstream as if it were a model name.
    const apiModel = MODEL_MAP[req.model] ?? stripPrefix(req.model, PREFIX);

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
