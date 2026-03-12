import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage, pollForResponse } from './grok.js';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini' as const;
  readonly loginUrl = 'https://gemini.google.com/app';
  readonly verifySelector = '.ql-editor';

  readonly models: ModelDefinition[] = [
    { id: 'web-gemini/gemini-2-5-pro',   provider: 'gemini', displayName: 'Gemini 2.5 Pro',   owned_by: 'google' },
    { id: 'web-gemini/gemini-2-5-flash', provider: 'gemini', displayName: 'Gemini 2.5 Flash', owned_by: 'google' },
    { id: 'web-gemini/gemini-3-pro',     provider: 'gemini', displayName: 'Gemini 3 Pro',     owned_by: 'google' },
    { id: 'web-gemini/gemini-3-flash',   provider: 'gemini', displayName: 'Gemini 3 Flash',   owned_by: 'google' },
  ];

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Gemini: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    if (!page.url().includes('gemini.google.com')) {
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
    }

    const userMsg = buildUserMessage(req.messages);

    const editor = page.locator('.ql-editor').first();
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await editor.fill(userMsg);
    await page.keyboard.press('Enter');

    yield* pollForResponse(
      page,
      'model-response .markdown',
      logger,
      this.name,
    );
  }
}
