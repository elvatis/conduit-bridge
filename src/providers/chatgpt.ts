import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage, pollForResponse } from './grok.js';

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly loginUrl = 'https://chatgpt.com';
  readonly verifySelector = '#prompt-textarea';

  readonly models: ModelDefinition[] = [
    { id: 'web-chatgpt/gpt-4o',     provider: 'chatgpt', displayName: 'GPT-4o',     owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-o3',     provider: 'chatgpt', displayName: 'GPT o3',     owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-o4-mini',provider: 'chatgpt', displayName: 'GPT o4-mini',owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5',      provider: 'chatgpt', displayName: 'GPT-5',      owned_by: 'openai' },
  ];

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('ChatGPT: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    if (!page.url().includes('chatgpt.com')) {
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
    }

    const userMsg = buildUserMessage(req.messages);

    const textarea = page.locator('#prompt-textarea').first();
    await textarea.waitFor({ timeout: 15000 });
    await textarea.click();
    await textarea.fill(userMsg);
    await page.keyboard.press('Enter');

    yield* pollForResponse(
      page,
      '[data-message-author-role="assistant"] .markdown',
      logger,
      this.name,
    );
  }
}
