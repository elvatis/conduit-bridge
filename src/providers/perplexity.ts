import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import { BaseProvider } from './base.js';
import { buildUserMessage, pollForResponse } from './grok.js';
import { logger } from '../logger.js';

/** Perplexity browser session, separate from the Perplexity API key provider. */
export class PerplexityProvider extends BaseProvider {
  readonly name = 'perplexity' as const;
  readonly loginUrl = 'https://www.perplexity.ai/';
  readonly verifySelector = 'textarea, [contenteditable="true"]';
  readonly models: ModelDefinition[] = [
    { id: 'web-perplexity/sonar', provider: 'perplexity', displayName: 'Perplexity Sonar (web)', owned_by: 'perplexity' },
    { id: 'web-perplexity/sonar-pro', provider: 'perplexity', displayName: 'Perplexity Sonar Pro (web)', owned_by: 'perplexity' },
    { id: 'web-perplexity/deep-research', provider: 'perplexity', displayName: 'Perplexity Deep Research (web)', owned_by: 'perplexity' },
  ];

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Perplexity: not connected. Run login first.');
    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
    if (!page.url().includes('perplexity.ai')) {
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
    const prompt = buildUserMessage(req.messages);
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    const tag = await editor.evaluate(el => el.tagName.toLowerCase()).catch(() => 'textarea');
    if (tag === 'textarea') await editor.fill(prompt);
    else await editor.evaluate((el, value) => { (el as { focus: () => void }).focus(); (globalThis as any).document.execCommand('insertText', false, value); }, prompt);
    await page.keyboard.press('Enter');
    logger.debug(`[perplexity] message sent (${prompt.length} chars)`);
    yield* pollForResponse(page, '[data-testid*="answer"], [class*="markdown"], .prose, article', logger, 'perplexity');
  }
}
