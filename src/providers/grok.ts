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
    let _onGrokPage = false;
    try { const _p = new URL(page.url()); _onGrokPage = _p.hostname === 'grok.com' || _p.hostname.endsWith('.grok.com'); } catch { _onGrokPage = false; }
    if (!_onGrokPage) {
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
    let _onGrokPageR = false;
    try { const _p = new URL(page?.url() ?? ''); _onGrokPageR = _p.hostname === 'grok.com' || _p.hostname.endsWith('.grok.com'); } catch { _onGrokPageR = false; }
    if (page && _onGrokPageR) {
      logger.debug('[grok] reloading page for init script...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ── Helpers shared across providers ──────────────────────────────────────────

/**
 * Build the message to paste into a web provider's chat input.
 *
 * Web providers (Grok, ChatGPT, Gemini) are NOT APIs - they are chat UIs
 * with their own system prompts and behavior. We must NOT dump the full
 * system prompt into the chat input because:
 * 1. It wastes context (the model sees instructions as a user message)
 * 2. The model responds to the instructions instead of the user's question
 * 3. The actual question gets buried at the end of a wall of text
 *
 * Strategy:
 * - Extract only code/file context from the system prompt (if any)
 * - Strip behavioral instructions ("You are Conduit...", mode prompts, etc.)
 * - Send the user's actual message prominently
 * - Keep any file contents, diagnostics, or code context as brief reference
 */
export function buildUserMessage(messages: Array<{ role: string; content: string }>): string {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

  // Extract only useful code context from system prompt - skip behavioral instructions
  const codeContext = extractCodeContext(system);

  // Single turn (most common case)
  if (userMessages.length === 1 && assistantMessages.length === 0) {
    if (codeContext) {
      return `${codeContext}\n\n${lastUserMsg}`;
    }
    return lastUserMsg;
  }

  // Multi-turn: include recent conversation history (last 3 exchanges max)
  const nonSystemMessages = messages.filter(m => m.role !== 'system');
  const recentMessages = nonSystemMessages.slice(-7); // last ~3.5 exchanges

  const parts: string[] = [];
  if (codeContext) {
    parts.push(codeContext);
  }

  // Only add role labels if there's actual back-and-forth
  if (recentMessages.length > 1) {
    const conversation = recentMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(conversation);
  } else {
    parts.push(lastUserMsg);
  }

  return parts.join('\n\n');
}

/**
 * Extract code-relevant context from the system prompt, discarding
 * behavioral instructions that web providers don't need.
 *
 * Keeps: file contents, code snippets, diagnostics, error messages
 * Drops: "You are Conduit...", mode instructions, CLAUDE.md content,
 *        tool catalogs, rendering instructions, etc.
 */
function extractCodeContext(system: string): string {
  if (!system) return '';

  const parts: string[] = [];

  // Extract "Current file: ..." line
  const fileMatch = system.match(/Current file:\s*(.+)/);
  if (fileMatch) parts.push(`Current file: ${fileMatch[1].trim()}`);

  // Extract "Workspace: ..." line
  const wsMatch = system.match(/Workspace:\s*(.+)/);
  if (wsMatch) parts.push(`Workspace: ${wsMatch[1].trim()}`);

  // Extract code blocks (```...```)
  const codeBlocks = system.match(/```[\s\S]*?```/g);
  if (codeBlocks) {
    for (const block of codeBlocks.slice(0, 3)) { // max 3 code blocks
      if (block.length < 3000) { // skip huge blocks
        parts.push(block);
      }
    }
  }

  // Extract diagnostics/errors sections
  const diagMatch = system.match(/(?:diagnostics|errors|warnings)[:\s]*\n([\s\S]*?)(?:\n\n|\n##|$)/i);
  if (diagMatch) {
    const diag = diagMatch[1].trim();
    if (diag.length < 1000) parts.push(`Diagnostics:\n${diag}`);
  }

  // Extract "prefix" and "suffix" context (code around cursor)
  const prefixMatch = system.match(/(?:prefix|before cursor)[:\s]*\n([\s\S]*?)(?:\n\n|$)/i);
  const suffixMatch = system.match(/(?:suffix|after cursor)[:\s]*\n([\s\S]*?)(?:\n\n|$)/i);
  if (prefixMatch) parts.push(`Code before cursor:\n${prefixMatch[1].trim().slice(-500)}`);
  if (suffixMatch) parts.push(`Code after cursor:\n${suffixMatch[1].trim().slice(0, 500)}`);

  // If nothing useful was extracted but the system prompt is short, include it
  // (it might be a simple context like "Fix this bug in Python")
  if (parts.length === 0 && system.length < 200 && !system.includes('You are')) {
    return system.trim();
  }

  return parts.join('\n');
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
