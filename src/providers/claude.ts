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

  private _conversationUrl: string | null = null;

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Claude: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
    const currentUrl = page.url();

    // Navigate only when needed:
    // 1. Not on claude.ai at all -> go to saved conversation or /new
    // 2. On /new but we have a saved conversation -> resume it
    if (!currentUrl.includes('claude.ai')) {
      const target = this._conversationUrl || 'https://claude.ai/new';
      logger.debug(`[claude] navigating to ${target}`);
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

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

    // Save the conversation URL once Claude redirects from /new to /chat/xxx
    // Wait a moment for redirect, then capture
    await new Promise(r => setTimeout(r, 1500));
    const convUrl = page.url();
    if (convUrl.includes('claude.ai/chat/')) {
      this._conversationUrl = convUrl;
      logger.debug(`[claude] conversation URL saved: ${convUrl}`);
    }

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
          const lastEl = assistants[assistants.length - 1];
          if (!lastEl) return '';

          // Clone to avoid mutating the live DOM
          const clone = lastEl.cloneNode(true);

          // Remove all non-content elements aggressively:
          // - details/summary: thinking/reasoning collapsible sections
          // - button, [role="button"]: artifact cards, tool-use controls
          // - svg, img, canvas, audio, video, iframe: media/icons
          // - [aria-hidden="true"]: screen-reader hidden UI elements
          clone.querySelectorAll(
            'details, summary, ' +
            'button, [role="button"], [role="status"], ' +
            'svg, img, canvas, audio, video, iframe, ' +
            '[aria-hidden="true"], [contenteditable]'
          ).forEach(el => el.remove());

          // Extract text ONLY from semantic markdown-rendered elements.
          // This naturally excludes UI chrome (thinking labels, tool status,
          // artifact buttons) which use div/span, not semantic HTML.
          const mdTags = 'p, h1, h2, h3, h4, h5, h6, ol, ul, pre, blockquote, table';
          const blocks = clone.querySelectorAll(mdTags);

          if (blocks.length > 0) {
            // Collect top-level blocks only (skip nested to avoid duplication)
            const seen = new Set();
            const parts = [];
            for (const el of blocks) {
              let dominated = false;
              let parent = el.parentElement;
              while (parent && parent !== clone) {
                if (seen.has(parent)) { dominated = true; break; }
                parent = parent.parentElement;
              }
              if (!dominated) {
                seen.add(el);
                const t = (el.innerText || '').trim();
                if (t) parts.push(t);
              }
            }
            return parts.join('\\n\\n');
          }

          // Fallback: if no semantic elements found, use innerText on cleaned clone
          return clone.innerText?.trim() ?? '';
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
