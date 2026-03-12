import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage, pollForResponse } from './grok.js';

export class ClaudeProvider extends BaseProvider {
  readonly name = 'claude' as const;
  readonly loginUrl = 'https://claude.ai/new';
  readonly verifySelector = '.ProseMirror';

  readonly models: ModelDefinition[] = [
    { id: 'web-claude/claude-sonnet', provider: 'claude', displayName: 'Claude Sonnet', owned_by: 'anthropic' },
    { id: 'web-claude/claude-opus',   provider: 'claude', displayName: 'Claude Opus',   owned_by: 'anthropic' },
    { id: 'web-claude/claude-haiku',  provider: 'claude', displayName: 'Claude Haiku',  owned_by: 'anthropic' },
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

    const userMsg = buildUserMessage(req.messages);

    // Type into ProseMirror editor
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await editor.fill(userMsg);

    // Submit with Enter
    await page.keyboard.press('Enter');

    // Wait for streaming response
    yield* pollForResponse(
      page,
      '[data-is-streaming] .font-claude-message, .font-claude-message',
      logger,
      this.name,
    );
  }
}
