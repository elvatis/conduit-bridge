import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
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

  private _modelUrlMap: Record<string, string> = {
    'web-grok/grok-expert':     'https://grok.com',
    'web-grok/grok-fast':       'https://grok.com',
    'web-grok/grok-heavy':      'https://grok.com',
    'web-grok/grok-4.20-beta':  'https://grok.com',
  };

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Grok: not connected. Run login first.');

    const url = this._modelUrlMap[req.model] ?? this._modelUrlMap['web-grok/grok-3'];
    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    // Navigate only if not already on Grok
    if (!page.url().includes('grok.com')) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    const userMsg = buildUserMessage(req.messages);

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

    // Wait for response - poll .message-bubble elements
    yield* pollForResponse(page, '.message-bubble', logger, this.name);
  }
}

// ── Helpers shared across providers ──────────────────────────────────────────

export function buildUserMessage(messages: Array<{ role: string; content: string }>): string {
  // Combine system + user messages into a single prompt
  const system = messages.find(m => m.role === 'system')?.content;
  const conversation = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  return system ? `${system}\n\n${conversation}` : conversation;
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
