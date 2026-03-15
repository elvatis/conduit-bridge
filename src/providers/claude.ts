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
  private _fetchPatched = false;

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

    // Navigate only when needed
    if (!currentUrl.includes('claude.ai')) {
      const target = this._conversationUrl || 'https://claude.ai/new';
      logger.debug(`[claude] navigating to ${target}`);
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Install fetch interceptor to capture SSE text deltas directly from the API.
    // This completely bypasses DOM parsing - no thinking/tool-use/artifact UI leaks.
    if (!this._fetchPatched) {
      await page.evaluate(`
        (() => {
          if (window.__conduitFetchPatched) return;
          const _fetch = window.fetch.bind(window);
          window.fetch = async function(...args) {
            const res = await _fetch(...args);
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            if (url.includes('/completion')) {
              // Reset state for this new completion
              window.__conduitText = '';
              window.__conduitDone = false;
              // Clone response so we can read the stream without affecting Claude's UI
              const clone = res.clone();
              (async () => {
                try {
                  const reader = clone.body.getReader();
                  const decoder = new TextDecoder();
                  let buffer = '';
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) { window.__conduitDone = true; break; }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue;
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                          window.__conduitText += data.delta.text;
                        }
                      } catch {}
                    }
                  }
                } catch {
                  window.__conduitDone = true;
                }
              })();
            }
            return res;
          };
          window.__conduitFetchPatched = true;
          window.__conduitText = '';
          window.__conduitDone = false;
        })()
      `);
      this._fetchPatched = true;
      logger.debug('[claude] fetch interceptor installed');
    }

    // Reset capture state before sending
    await page.evaluate(`
      window.__conduitText = '';
      window.__conduitDone = false;
    `);

    const userMsg = buildUserMessage(req.messages);

    // Type into ProseMirror editor
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

    logger.debug(`[claude] message sent (${userMsg.length} chars), streaming via SSE interception...`);

    // Save conversation URL after redirect
    await new Promise(r => setTimeout(r, 1500));
    const convUrl = page.url();
    if (convUrl.includes('claude.ai/chat/')) {
      this._conversationUrl = convUrl;
      logger.debug(`[claude] conversation URL saved: ${convUrl}`);
    }

    // Poll the intercepted SSE text
    const timeout = 120000;
    const pollInterval = 300;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
        ({ text: window.__conduitText || '', done: !!window.__conduitDone })
      `) as { text: string; done: boolean };

      if (!result.text) continue;

      if (result.text.length > lastLength) {
        yield result.text.slice(lastLength);
        lastLength = result.text.length;
        stableCount = 0;
      } else if (result.done) {
        logger.debug(`[claude] SSE stream complete (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        if (stableCount >= 6 && lastLength > 0) {
          logger.debug(`[claude] response stable (${lastLength} chars)`);
          return;
        }
      }
    }

    logger.warn('[claude] response polling timed out');
  }
}
