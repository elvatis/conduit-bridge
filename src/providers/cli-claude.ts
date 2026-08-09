import { homedir } from 'node:os';
import type {
  BridgeConfig,
  ProviderName,
  ChatRequest,
  ModelDefinition,
  ProviderAdapter,
} from '../types.js';
import { logger } from '../logger.js';
import {
  resolveExecutable,
  runCli,
  flattenMessages,
  stripPrefix,
  DEFAULT_CLI_TIMEOUT_MS,
} from './cli-util.js';

// Anthropic Claude Code CLI (@anthropic-ai/claude-code) — headless via -p/--print.
// Install: npm i -g @anthropic-ai/claude-code  then authenticate (claude /login or API key)
// Docs: https://www.npmjs.com/package/@anthropic-ai/claude-code
const PREFIX = 'cli-claude/';
const BIN = 'claude';

// Curated Claude Code models (2026-08): Opus 5, Sonnet 5, Haiku 4.5, Fable 5.
const CATALOG = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-fable-5',
];

export class ClaudeCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-claude';

  readonly models: ModelDefinition[] = CATALOG.map(id => ({
    id: `${PREFIX}${id}`,
    provider: 'cli-claude',
    displayName: `${id} (Claude Code CLI)`,
    owned_by: 'anthropic',
  }));

  constructor(_cfg: BridgeConfig) {}

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    return resolveExecutable(BIN) !== null;
  }

  async ensureConnected(): Promise<boolean> {
    const ok = await this.checkSession();
    if (!ok) {
      logger.warn(
        '[cli-claude] `claude` not found on PATH. Install with: npm i -g @anthropic-ai/claude-code',
      );
    }
    return ok;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-claude uses the local Claude Code CLI — install @anthropic-ai/claude-code and authenticate ' +
        '(claude login / ANTHROPIC_API_KEY), not a browser login via conduit-bridge.',
    );
  }

  async logout(): Promise<void> {
    logger.info('[cli-claude] local CLI — nothing to disconnect');
  }

  private async _run(req: ChatRequest): Promise<string> {
    const binPath = resolveExecutable(BIN);
    if (!binPath) {
      throw new Error(
        'claude CLI not found on PATH. Install with: npm i -g @anthropic-ai/claude-code',
      );
    }

    const model = stripPrefix(req.model, PREFIX);
    const prompt = flattenMessages(req.messages);

    // -p/--print: non-interactive. --output-format text: plain assistant text.
    // --permission-mode plan: read-only agent tools for chat-proxy safety.
    // Prompt as last argv (Node spawn handles long args better than cmd.exe).
    const args = [
      '-p',
      '--output-format', 'text',
      '--model', model,
      '--permission-mode', 'plan',
      prompt,
    ];

    const result = await runCli({
      binPath,
      args,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: homedir(),
      label: 'cli-claude',
      log: msg => logger.info(msg),
    });

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      const detail =
        result.timedOut || result.exitCode === 143
          ? `timeout: claude killed by supervisor (exit ${result.exitCode})`
          : result.stderr || '(no output)';
      throw new Error(`claude exited ${result.exitCode}: ${detail}`);
    }
    return result.stdout || result.stderr;
  }

  async chat(req: ChatRequest): Promise<string> {
    return this._run(req);
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const content = await this._run(req);
    if (content) yield content;
  }
}
