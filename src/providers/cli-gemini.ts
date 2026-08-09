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
import { toAgyEffort } from '../effort.js';

// Google Antigravity CLI binary is `agy` (install scripts from antigravity.google).
// Headless: agy -p/--print with --model and --output-format text.
// Fallback: legacy `gemini` binary if still on PATH.
// Docs: https://antigravity.google/docs/cli/getting-started
const PREFIX = 'cli-gemini/';

// Model ids from `agy models` (2026-08). Effort tiers are separate ids.
const CATALOG = [
  'gemini-3.6-flash-high',
  'gemini-3.6-flash-medium',
  'gemini-3.6-flash-low',
  'gemini-3.5-flash-high',
  'gemini-3.5-flash-medium',
  'gemini-3.5-flash-low',
  'gemini-3.1-pro-high',
  'gemini-3.1-pro-low',
];

function resolveGeminiBin(): string | null {
  // Prefer the current Antigravity CLI binary name.
  return resolveExecutable('agy')
    ?? resolveExecutable('gemini')
    ?? resolveExecutable('antigravity');
}

export class GeminiCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-gemini';

  readonly models: ModelDefinition[] = CATALOG.map(id => ({
    id: `${PREFIX}${id}`,
    provider: 'cli-gemini',
    displayName: `${id} (agy CLI)`,
    owned_by: 'google',
  }));

  constructor(_cfg: BridgeConfig) {}

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    return resolveGeminiBin() !== null;
  }

  async ensureConnected(): Promise<boolean> {
    const ok = await this.checkSession();
    if (!ok) {
      logger.warn(
        '[cli-gemini] `agy` not found on PATH. Install Antigravity CLI ' +
          '(https://antigravity.google/docs/cli/getting-started) — binary name is `agy`.',
      );
    }
    return ok;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-gemini uses the local Antigravity CLI (`agy`) — install and authenticate there ' +
        '(not a browser login via conduit-bridge).',
    );
  }

  async logout(): Promise<void> {
    logger.info('[cli-gemini] local CLI — nothing to disconnect');
  }

  private async _run(req: ChatRequest): Promise<string> {
    const binPath = resolveGeminiBin();
    if (!binPath) {
      throw new Error(
        'agy CLI not found on PATH. Install Antigravity CLI (binary: agy).',
      );
    }

    const model = stripPrefix(req.model, PREFIX);
    const prompt = flattenMessages(req.messages);
    const isAgy = /agy(\.exe)?$/i.test(binPath);
    const effort = toAgyEffort(req.effort);

    // agy: -p/--print, --model, --output-format, --mode plan, --effort low|medium|high
    // legacy gemini: -p, -m, -o text, --approval-mode plan
    const args = isAgy
      ? [
          '-p', prompt,
          '--model', model,
          '--output-format', 'text',
          '--mode', 'plan',
          ...(effort ? ['--effort', effort] : []),
        ]
      : [
          '-p', prompt,
          '-m', model,
          '-o', 'text',
          '--approval-mode', 'plan',
        ];

    const result = await runCli({
      binPath,
      args,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: homedir(),
      label: 'cli-gemini',
      log: msg => logger.info(msg),
    });

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      const detail =
        result.timedOut || result.exitCode === 143
          ? `timeout: agy/gemini CLI killed by supervisor (exit ${result.exitCode})`
          : result.stderr || '(no output)';
      throw new Error(`cli-gemini exited ${result.exitCode}: ${detail}`);
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
