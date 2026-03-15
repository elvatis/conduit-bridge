import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage } from './grok.js';

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

  readonly models: ModelDefinition[] = [
    { id: 'web-claude/claude-opus',        provider: 'claude', displayName: 'Claude Opus 4.6',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-sonnet',      provider: 'claude', displayName: 'Claude Sonnet 4.6', owned_by: 'anthropic' },
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
    await page.keyboard.press('Enter');

    logger.debug(`[claude] message sent (${userMsg.length} chars), streaming via SSE interception...`);

    // Save conversation URL after redirect
    await new Promise(r => setTimeout(r, 1500));
    const convUrl = page.url();
    if (convUrl.includes('claude.ai/chat/')) {
      this._conversationUrl = convUrl;
      logger.debug(`[claude] conversation URL saved: ${convUrl}`);
    }

    // Poll the intercepted SSE text + metadata
    const timeout = 120000;
    const pollInterval = 300;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
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
      `) as {
        text: string; done: boolean;
        thinking: boolean; toolName: string | null; toolRunning: boolean;
        inputTokens: number; outputTokens: number; elapsed: number;
      };

      // Update metadata for server to read
      this._meta = {
        thinking: result.thinking,
        toolName: result.toolName,
        toolRunning: result.toolRunning,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        elapsedMs: result.elapsed,
      };

      if (!result.text) continue;

      if (result.text.length > lastLength) {
        yield result.text.slice(lastLength);
        lastLength = result.text.length;
        stableCount = 0;
      } else if (result.done) {
        logger.debug(`[claude] SSE stream complete (${lastLength} chars, ${result.elapsed}ms, ${result.outputTokens} tokens)`);
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
