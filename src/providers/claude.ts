import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage } from './grok.js';

export class ClaudeProvider extends BaseProvider {
  readonly name = 'claude' as const;
  readonly loginUrl = 'https://claude.ai/new';
  readonly verifySelector = '.ProseMirror';

  readonly models: ModelDefinition[] = [
    { id: 'web-claude/claude-opus',        provider: 'claude', displayName: 'Claude Opus 4.6',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-sonnet',      provider: 'claude', displayName: 'Claude Sonnet 4.6', owned_by: 'anthropic' },
    { id: 'web-claude/claude-haiku',       provider: 'claude', displayName: 'Claude Haiku 4.5',  owned_by: 'anthropic' },
    { id: 'web-claude/claude-opus-4-5',    provider: 'claude', displayName: 'Claude Opus 4.5',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-sonnet-4-5',  provider: 'claude', displayName: 'Claude Sonnet 4.5', owned_by: 'anthropic' },
  ];

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Claude: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    // Always start a new conversation
    await page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const userMsg = buildUserMessage(req.messages);

    // Count assistant messages before sending
    const countBefore = await page.evaluate(`
      (() => {
        const all = [...document.querySelectorAll('[data-test-render-count]')];
        return all.filter(el => {
          const child = el.querySelector('div');
          return child && !child.className.includes('mb-1');
        }).length;
      })()
    `) as number;

    // Type into ProseMirror editor via execCommand (more reliable)
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await editor.evaluate((el: { focus: () => void }, msg: string) => {
      el.focus();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).document.execCommand('insertText', false, msg);
    }, userMsg);

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');

    logger.debug(`[claude] message sent (${userMsg.length} chars), streaming...`);

    // Poll DOM for assistant response using [data-test-render-count] elements
    const timeout = 120000;
    const pollInterval = 500;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const text = await page.evaluate(`
        (() => {
          const before = ${countBefore};
          const all = [...document.querySelectorAll('[data-test-render-count]')];
          const assistants = all.filter(el => {
            const child = el.querySelector('div');
            return child && !child.className.includes('mb-1');
          });
          if (assistants.length <= before) return '';
          return assistants[assistants.length - 1]?.textContent?.trim() ?? '';
        })()
      `) as string;

      if (!text) continue;

      if (text.length > lastLength) {
        yield text.slice(lastLength);
        lastLength = text.length;
        stableCount = 0;
      } else {
        stableCount++;
        if (stableCount >= 3 && lastLength > 0) {
          logger.debug(`[claude] response complete (${lastLength} chars)`);
          return;
        }
      }
    }

    logger.warn('[claude] response polling timed out');
  }
}
