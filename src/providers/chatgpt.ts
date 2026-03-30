import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage } from './grok.js';

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly loginUrl = 'https://chatgpt.com';
  readonly verifySelector = '#prompt-textarea, [contenteditable="true"]';

  readonly models: ModelDefinition[] = [
    { id: 'web-chatgpt/gpt-5.4-pro',       provider: 'chatgpt', displayName: 'GPT-5.4 Pro',       owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5.4-thinking',  provider: 'chatgpt', displayName: 'GPT-5.4 Thinking',  owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5.3-instant',   provider: 'chatgpt', displayName: 'GPT-5.3 Instant',   owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5-thinking-mini', provider: 'chatgpt', displayName: 'GPT-5 Thinking Mini', owned_by: 'openai' },
    { id: 'web-chatgpt/o3',                provider: 'chatgpt', displayName: 'o3',                 owned_by: 'openai' },
  ];

  private _patchedCtx: BrowserContext | null = null;

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('ChatGPT: not connected. Run login first.');

    // Install fetch interceptor to capture ChatGPT's streaming response
    await this._ensureInitScript();

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    let _onChatGptPage = false;
    try { const _p = new URL(page.url()); _onChatGptPage = _p.hostname === 'chatgpt.com' || _p.hostname.endsWith('.chatgpt.com'); } catch { _onChatGptPage = false; }
    if (!_onChatGptPage) {
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    const userMsg = buildUserMessage(req.messages);

    // Reset capture state before sending
    await page.evaluate(`
      window.__conduitChatGPT = { text:'', done:false, startTime:Date.now() };
    `);

    const textarea = page.locator('#prompt-textarea, [contenteditable="true"]').first();
    await textarea.waitFor({ timeout: 15000 });
    await textarea.click();
    await textarea.fill(userMsg);

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');

    logger.debug(`[chatgpt] message sent (${userMsg.length} chars), streaming via fetch interception...`);

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
        window.__conduitChatGPT ? {
          text: window.__conduitChatGPT.text || '',
          done: !!window.__conduitChatGPT.done
        } : { text:'', done:false }
      `) as { text: string; done: boolean };

      if (!result.text && !hasContent) continue;

      if (result.text.length > lastLength) {
        yield result.text.slice(lastLength);
        lastLength = result.text.length;
        stableCount = 0;
        hasContent = true;
      } else if (result.done) {
        logger.debug(`[chatgpt] stream complete (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        if (stableCount >= 4 && lastLength > 0) {
          logger.debug(`[chatgpt] response stable (${lastLength} chars)`);
          return;
        }
      }
    }

    // If fetch interception got nothing, fall back to DOM polling
    if (lastLength === 0) {
      logger.info('[chatgpt] fetch interception captured nothing, falling back to DOM polling...');
      yield* pollForResponseDOM(page);
    } else {
      logger.warn('[chatgpt] response polling timed out');
    }
  }

  /** Install fetch interceptor to capture ChatGPT's streaming API responses */
  private async _ensureInitScript(): Promise<void> {
    if (!this._ctx || this._ctx === this._patchedCtx) return;

    await this._ctx.addInitScript(`
      (() => {
        if (window.__conduitChatGPTPatched) return;

        window.__conduitChatGPT = { text: '', done: false, startTime: 0 };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await _fetch.apply(this, args);
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          // Intercept ChatGPT's conversation API calls
          if (url.includes('/backend-api/conversation') ||
              url.includes('/backend-anon/conversation') ||
              url.includes('chat/completions')) {

            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('text/event-stream') && !ct.includes('text/plain') &&
                !ct.includes('application/json') && !ct.includes('octet-stream')) {
              return res;
            }

            window.__conduitChatGPT.text = '';
            window.__conduitChatGPT.done = false;
            window.__conduitChatGPT.startTime = Date.now();

            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { window.__conduitChatGPT.done = true; break; }
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') {
                      if (raw === '[DONE]') window.__conduitChatGPT.done = true;
                      continue;
                    }
                    try {
                      const d = JSON.parse(raw);
                      // ChatGPT SSE format - message parts
                      if (d.message?.content?.parts) {
                        const text = d.message.content.parts.join('');
                        if (text.length > window.__conduitChatGPT.text.length) {
                          window.__conduitChatGPT.text = text;
                        }
                      }
                      // OpenAI-compatible delta format
                      if (d.choices?.[0]?.delta?.content) {
                        window.__conduitChatGPT.text += d.choices[0].delta.content;
                      }
                      // Full message format
                      if (d.choices?.[0]?.message?.content) {
                        window.__conduitChatGPT.text = d.choices[0].message.content;
                      }
                    } catch {}
                  }
                }
              } catch {
                window.__conduitChatGPT.done = true;
              }
            })();
          }
          return res;
        };

        window.__conduitChatGPTPatched = true;
      })()
    `);

    this._patchedCtx = this._ctx;
    logger.debug('[chatgpt] addInitScript installed on context');

    // Reload current page so init script takes effect
    const page = this._ctx.pages()[0];
    let _onChatGptPageR = false;
    try { const _p = new URL(page?.url() ?? ''); _onChatGptPageR = _p.hostname === 'chatgpt.com' || _p.hostname.endsWith('.chatgpt.com'); } catch { _onChatGptPageR = false; }
    if (page && _onChatGptPageR) {
      logger.debug('[chatgpt] reloading page for init script...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/** DOM-based fallback for response extraction */
async function* pollForResponseDOM(
  page: import('playwright').Page,
): AsyncGenerator<string> {
  const selectors = [
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"]',
    'article[data-testid*="conversation-turn"] .markdown',
    '.agent-turn .markdown',
    '.result-streaming',
    '.text-message .markdown',
    // Generic fallbacks
    '.group\\/conversation-turn:last-child .markdown',
    'article:last-of-type .markdown',
  ];

  const timeout = 60000;
  const pollInterval = 500;
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;
  let matchedSelector = '';

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    if (!matchedSelector) {
      for (const sel of selectors) {
        const count = await page.locator(sel).count().catch(() => 0);
        if (count > 0) {
          matchedSelector = sel;
          logger.debug(`[chatgpt] DOM fallback matched selector: ${sel}`);
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
        logger.debug(`[chatgpt] DOM fallback complete (${lastLength} chars)`);
        return;
      }
    }
  }

  logger.warn('[chatgpt] DOM fallback timed out');
}
