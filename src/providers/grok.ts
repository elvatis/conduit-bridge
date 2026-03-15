import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';

export class GrokProvider extends BaseProvider {
  readonly name = 'grok' as const;
  readonly loginUrl = 'https://grok.com';
  readonly verifySelector = '.ProseMirror, [contenteditable="true"]';

  readonly models: ModelDefinition[] = [
    { id: 'web-grok/grok-expert',     provider: 'grok', displayName: 'Grok Expert',      owned_by: 'xai' },
    { id: 'web-grok/grok-fast',       provider: 'grok', displayName: 'Grok Fast',        owned_by: 'xai' },
    { id: 'web-grok/grok-heavy',      provider: 'grok', displayName: 'Grok Heavy',       owned_by: 'xai' },
    { id: 'web-grok/grok-4.20-beta',  provider: 'grok', displayName: 'Grok 4.20 Beta',   owned_by: 'xai' },
  ];

  private _patchedCtx: BrowserContext | null = null;

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Grok: not connected. Run login first.');

    // Install fetch interceptor to capture Grok's streaming response
    await this._ensureInitScript();

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    // Navigate only if not already on Grok
    if (!page.url().includes('grok.com')) {
      await page.goto('https://grok.com', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    const userMsg = buildUserMessage(req.messages);

    // Reset capture state before sending
    await page.evaluate(`
      window.__conduitGrok = { text:'', done:false, startTime:Date.now() };
    `);

    // Type into ProseMirror editor via execCommand (more reliable than fill)
    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    await editor.waitFor({ timeout: 10000 });
    await editor.click();
    await editor.evaluate((el: { focus: () => void }, msg: string) => {
      el.focus();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).document.execCommand('insertText', false, msg);
    }, userMsg);

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');

    logger.debug(`[grok] message sent (${userMsg.length} chars), streaming via fetch interception...`);

    // Poll the intercepted response text
    const timeout = 120000;
    const pollInterval = 400;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;
    let hasContent = false;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
        window.__conduitGrok ? {
          text: window.__conduitGrok.text || '',
          done: !!window.__conduitGrok.done
        } : { text:'', done:false }
      `) as { text: string; done: boolean };

      if (!result.text && !hasContent) continue;

      if (result.text.length > lastLength) {
        yield result.text.slice(lastLength);
        lastLength = result.text.length;
        stableCount = 0;
        hasContent = true;
      } else if (result.done) {
        logger.debug(`[grok] stream complete (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        // If text hasn't changed for 4 polls (1.6s) and we have content, done
        if (stableCount >= 4 && lastLength > 0) {
          logger.debug(`[grok] response stable (${lastLength} chars)`);
          return;
        }
      }
    }

    // If fetch interception got nothing, fall back to DOM polling
    if (lastLength === 0) {
      logger.info('[grok] fetch interception captured nothing, falling back to DOM polling...');
      yield* pollForResponseDOM(page);
    } else {
      logger.warn('[grok] response polling timed out');
    }
  }

  /** Install fetch/XHR interceptor to capture Grok's streaming API responses */
  private async _ensureInitScript(): Promise<void> {
    if (!this._ctx || this._ctx === this._patchedCtx) return;

    await this._ctx.addInitScript(`
      (() => {
        if (window.__conduitGrokPatched) return;

        window.__conduitGrok = { text: '', done: false, startTime: 0 };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await _fetch.apply(this, args);
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          // Intercept Grok's chat/conversation API calls
          if (url.includes('/rest/app-chat/conversations/') ||
              url.includes('/api/') ||
              url.includes('add-response') ||
              url.includes('chat/completions') ||
              url.includes('grok/share')) {

            // Check content type - only intercept streaming/text responses
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('text/event-stream') && !ct.includes('text/plain') &&
                !ct.includes('application/json') && !ct.includes('octet-stream')) {
              return res;
            }

            // Reset for new completion
            window.__conduitGrok.text = '';
            window.__conduitGrok.done = false;
            window.__conduitGrok.startTime = Date.now();

            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { window.__conduitGrok.done = true; break; }
                  buffer += decoder.decode(value, { stream: true });

                  // Try SSE format first (data: lines)
                  const lines = buffer.split('\\n');
                  buffer = lines.pop() || '';
                  let parsed = false;

                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') {
                      if (raw === '[DONE]') window.__conduitGrok.done = true;
                      continue;
                    }
                    try {
                      const d = JSON.parse(raw);
                      // OpenAI-compatible format
                      if (d.choices && d.choices[0]?.delta?.content) {
                        window.__conduitGrok.text += d.choices[0].delta.content;
                        parsed = true;
                      }
                      // Grok's native result format
                      if (d.result && typeof d.result.response === 'string') {
                        window.__conduitGrok.text = d.result.response;
                        parsed = true;
                      }
                      // Token text field
                      if (d.token && typeof d.token === 'string') {
                        window.__conduitGrok.text += d.token;
                        parsed = true;
                      }
                    } catch {}
                  }

                  // If not SSE, try raw text/JSON accumulation
                  if (!parsed && buffer.length > 0) {
                    try {
                      const j = JSON.parse(buffer);
                      if (j.result?.response) {
                        window.__conduitGrok.text = j.result.response;
                        buffer = '';
                      } else if (j.modelResponse?.message) {
                        window.__conduitGrok.text = j.modelResponse.message;
                        buffer = '';
                      }
                    } catch {
                      // Not complete JSON yet, keep buffering
                    }
                  }
                }
              } catch {
                window.__conduitGrok.done = true;
              }
            })();
          }
          return res;
        };

        window.__conduitGrokPatched = true;
      })()
    `);

    this._patchedCtx = this._ctx;
    logger.debug('[grok] addInitScript installed on context');

    // Reload current page so init script takes effect
    const page = this._ctx.pages()[0];
    if (page && page.url().includes('grok.com')) {
      logger.debug('[grok] reloading page for init script...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ── Helpers shared across providers ──────────────────────────────────────────

export function buildUserMessage(messages: Array<{ role: string; content: string }>): string {
  const system = messages.find(m => m.role === 'system')?.content;
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

  // If there's only a single user message with optional system context,
  // send just the user message to avoid confusing web UI providers
  if (messages.filter(m => m.role !== 'system').length === 1) {
    if (system) {
      return `[Context: ${system}]\n\n${lastUserMsg}`;
    }
    return lastUserMsg;
  }

  // Multi-turn: include conversation history
  const conversation = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  return system ? `[Context: ${system}]\n\n${conversation}` : conversation;
}

/** DOM-based fallback for response extraction - tries multiple common selectors */
async function* pollForResponseDOM(
  page: import('playwright').Page,
): AsyncGenerator<string> {
  // Grok uses various selectors across versions - try them all
  const selectors = [
    'article[data-testid] .markdown',
    '[class*="message"] [class*="markdown"]',
    '[class*="response"] [class*="content"]',
    '.message-bubble',
    'article .prose',
    '[data-message-author-role="assistant"]',
    '.items-start .markdown',
    // Generic: last large text block that appeared after our input
    'article:last-of-type',
  ];

  const timeout = 60000;
  const pollInterval = 500;
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;
  let matchedSelector = '';

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    // Find first matching selector
    if (!matchedSelector) {
      for (const sel of selectors) {
        const count = await page.locator(sel).count().catch(() => 0);
        if (count > 0) {
          matchedSelector = sel;
          logger.debug(`[grok] DOM fallback matched selector: ${sel}`);
          break;
        }
      }
      if (!matchedSelector) continue;
    }

    const elements = page.locator(matchedSelector);
    const count = await elements.count().catch(() => 0);
    if (count === 0) continue;

    const lastEl = elements.last();
    const text = await lastEl.textContent().catch(() => '');
    if (!text) continue;

    if (text.length > lastLength) {
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
    } else {
      stableCount++;
      if (stableCount >= 3 && lastLength > 0) {
        logger.debug(`[grok] DOM fallback complete (${lastLength} chars)`);
        return;
      }
    }
  }

  logger.warn('[grok] DOM fallback timed out');
}

export async function* pollForResponse(
  page: import('playwright').Page,
  responseSelector: string,
  log: typeof logger,
  providerName: string,
): AsyncGenerator<string> {
  const timeout = 120000;
  const pollInterval = 500;
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;

  // Wait for a new response element to appear
  await page.waitForSelector(responseSelector, { timeout: 30000 }).catch(() => {});

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    const elements = page.locator(responseSelector);
    const count = await elements.count().catch(() => 0);
    if (count === 0) continue;

    const lastEl = elements.last();
    const text = await lastEl.textContent().catch(() => '');
    if (!text) continue;

    if (text.length > lastLength) {
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
    } else {
      stableCount++;
      // If text hasn't changed for 3 polls (1.5s), consider it done
      if (stableCount >= 3 && lastLength > 0) {
        log.debug(`[${providerName}] response complete (${lastLength} chars)`);
        return;
      }
    }
  }

  log.warn(`[${providerName}] response polling timed out`);
}
