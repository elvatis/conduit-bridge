import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage } from './grok.js';
import { streamMerged, CLAUDE_INTERCEPT, type InPageState } from './interception.js';

/** Metadata captured from Claude's SSE stream */
export interface StreamMeta {
  thinking: boolean;
  toolName: string | null;
  toolRunning: boolean;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}

export class ClaudeProvider extends BaseProvider {
  readonly name = 'claude' as const;
  readonly loginUrl = 'https://claude.ai/new';
  readonly verifySelector = '.ProseMirror';

  // The generic ids track whatever claude.ai currently serves for that tier.
  // NOTE: the web provider does not switch the model in the browser UI; every
  // web-claude id routes to the account's active claude.ai model. These labels
  // are advisory (what claude.ai serves today), not per-id model selection.
  readonly models: ModelDefinition[] = [
    { id: 'web-claude/claude-opus',        provider: 'claude', displayName: 'Claude Opus 4.8',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-sonnet',      provider: 'claude', displayName: 'Claude Sonnet 5',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-haiku',       provider: 'claude', displayName: 'Claude Haiku 4.5',  owned_by: 'anthropic' },
    { id: 'web-claude/claude-opus-4-5',    provider: 'claude', displayName: 'Claude Opus 4.5',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-sonnet-4-5',  provider: 'claude', displayName: 'Claude Sonnet 4.5', owned_by: 'anthropic' },
  ];

  private _conversationUrl: string | null = null;
  private _patchedCtx: BrowserContext | null = null;
  private _meta: StreamMeta = this._defaultMeta();

  constructor(cfg: BridgeConfig) { super(cfg); }

  /** Current streaming metadata - read by server.ts to include in SSE events */
  get currentMeta(): StreamMeta {
    return { ...this._meta };
  }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Claude: not connected. Run login first.');

    // Install fetch interceptor via addInitScript (runs BEFORE page JS)
    // This is critical: page.evaluate would run AFTER Claude.ai captures fetch
    await this._ensureInitScript();

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
    const currentUrl = page.url();

    // Navigate only when needed
    if (!currentUrl.includes('claude.ai')) {
      const target = this._conversationUrl || 'https://claude.ai/new';
      logger.debug(`[claude] navigating to ${target}`);
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Reset capture state before sending
    this._meta = this._defaultMeta();
    await page.evaluate(`
      window.__conduit = { text:'', done:false, thinking:false, toolName:null, toolRunning:false, inputTokens:0, outputTokens:0, startTime:Date.now() };
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

    // Arm the network-layer capture just before submitting so it locks onto
    // this turn's backend completion response (primary path, issue #35).
    const capture = this.startNetworkCapture(page, CLAUDE_INTERCEPT);

    // arm + submit + the post-submit URL capture live inside the try so
    // capture.detach() always runs even if a page op throws (e.g. page.url()
    // after a submit-time navigation). Otherwise the page.on('response')
    // listener would leak on the long-lived reused page.
    try {
      capture.arm();
      await page.keyboard.press('Enter');

      logger.debug(`[claude] message sent (${userMsg.length} chars), capturing backend SSE stream...`);

      // Save conversation URL after redirect
      await new Promise(r => setTimeout(r, 1500));
      const convUrl = page.url();
      if (convUrl.includes('claude.ai/chat/')) {
        this._conversationUrl = convUrl;
        logger.debug(`[claude] conversation URL saved: ${convUrl}`);
      }

      // Primary: network interception via streamMerged. Claude also surfaces
      // streaming metadata (thinking / tool / token counts) via the in-page
      // reader, which we keep fresh for the server through onTick. DOM polling is
      // the automatic fallback if the network layer captures nothing.
      yield* streamMerged({
        provider: 'claude',
        capture,
        pollInterval: 300,
        stableTicks: 6,
        readInPage: () => page.evaluate(`
          window.__conduit ? {
            text: window.__conduit.text || '',
            done: !!window.__conduit.done,
            thinking: !!window.__conduit.thinking,
            toolName: window.__conduit.toolName || null,
            toolRunning: !!window.__conduit.toolRunning,
            inputTokens: window.__conduit.inputTokens || 0,
            outputTokens: window.__conduit.outputTokens || 0,
            elapsed: window.__conduit.startTime ? Date.now() - window.__conduit.startTime : 0
          } : { text:'', done:false, thinking:false, toolName:null, toolRunning:false, inputTokens:0, outputTokens:0, elapsed:0 }
        `) as Promise<InPageState>,
        onTick: (state: InPageState) => {
          // Keep server-visible metadata in sync with the in-page reader.
          this._meta = {
            thinking: state.thinking === true,
            toolName: (state.toolName as string | null) ?? null,
            toolRunning: state.toolRunning === true,
            inputTokens: typeof state.inputTokens === 'number' ? state.inputTokens : 0,
            outputTokens: typeof state.outputTokens === 'number' ? state.outputTokens : 0,
            elapsedMs: typeof state.elapsed === 'number' ? state.elapsed : 0,
          };
        },
        domFallback: () => pollForResponseDOM(page),
      });
    } finally {
      capture.detach();
    }
  }

  /** Install fetch interceptor on the browser context - runs before any page JS */
  private async _ensureInitScript(): Promise<void> {
    if (!this._ctx || this._ctx === this._patchedCtx) return;

    await this._ctx.addInitScript(`
      (() => {
        if (window.__conduitPatched) return;

        // State object shared with Playwright evaluate calls
        window.__conduit = {
          text: '', done: false,
          thinking: false, toolName: null, toolRunning: false,
          inputTokens: 0, outputTokens: 0, startTime: 0
        };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await _fetch.apply(this, args);
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          // Intercept Claude's completion API calls
          if (url.includes('completion') || url.includes('chat_conversations')) {
            // Reset for new completion
            window.__conduit.text = '';
            window.__conduit.done = false;
            window.__conduit.thinking = false;
            window.__conduit.toolName = null;
            window.__conduit.toolRunning = false;
            window.__conduit.inputTokens = 0;
            window.__conduit.outputTokens = 0;
            window.__conduit.startTime = Date.now();

            // Clone response so Claude's UI is unaffected
            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { window.__conduit.done = true; break; }
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\\n');
                  buffer = lines.pop() || '';
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                      const d = JSON.parse(raw);
                      // Text content
                      if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') {
                        window.__conduit.text += d.delta.text;
                      }
                      // Thinking state
                      if (d.type === 'content_block_start' && d.content_block?.type === 'thinking') {
                        window.__conduit.thinking = true;
                      }
                      if (d.type === 'content_block_stop') {
                        window.__conduit.thinking = false;
                        window.__conduit.toolRunning = false;
                      }
                      // Tool use
                      if (d.type === 'content_block_start' && d.content_block?.type === 'tool_use') {
                        window.__conduit.toolName = d.content_block.name || 'tool';
                        window.__conduit.toolRunning = true;
                      }
                      // Usage stats
                      if (d.type === 'message_delta' && d.usage) {
                        window.__conduit.outputTokens = d.usage.output_tokens || 0;
                      }
                      if (d.type === 'message_start' && d.message?.usage) {
                        window.__conduit.inputTokens = d.message.usage.input_tokens || 0;
                      }
                    } catch {}
                  }
                }
              } catch {
                window.__conduit.done = true;
              }
            })();
          }
          return res;
        };

        window.__conduitPatched = true;
      })()
    `);

    this._patchedCtx = this._ctx;
    logger.debug('[claude] addInitScript installed on context');

    // Reload current page so init script takes effect
    const page = this._ctx.pages()[0];
    if (page && page.url().includes('claude.ai')) {
      logger.debug('[claude] reloading page for init script...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  private _defaultMeta(): StreamMeta {
    return { thinking: false, toolName: null, toolRunning: false, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
  }
}

/**
 * DOM-based fallback for response extraction, used only when network
 * interception captures nothing (see streamMerged). Claude historically had no
 * DOM poller; these selectors are current-markup guesses and NEED live
 * verification against claude.ai before being relied upon.
 */
async function* pollForResponseDOM(
  page: import('playwright').Page,
): AsyncGenerator<string> {
  const selectors = [
    '[data-testid="assistant-message"] .prose',
    'div.font-claude-message .prose',
    'div.font-claude-message',
    '[data-is-streaming] .prose',
    // Generic fallbacks
    '.prose:last-of-type',
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
          logger.debug(`[claude] DOM fallback matched selector: ${sel}`);
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
        logger.debug(`[claude] DOM fallback complete (${lastLength} chars)`);
        return;
      }
    }
  }

  logger.warn('[claude] DOM fallback timed out');
}
