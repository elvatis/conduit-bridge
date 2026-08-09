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
import { toOpenAiEffort } from '../effort.js';

// OpenAI Codex CLI (@openai/codex) — non-interactive via `codex exec`.
// Install: npm i -g @openai/codex  then  codex login
// Docs: https://www.npmjs.com/package/@openai/codex
const PREFIX = 'cli-codex/';
const BIN = 'codex';

// Curated models for Codex CLI (same GPT-5.6 family as the API, 2026-08).
const CATALOG = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.5-pro',
];

export class CodexCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-codex';

  readonly models: ModelDefinition[] = CATALOG.map(id => ({
    id: `${PREFIX}${id}`,
    provider: 'cli-codex',
    displayName: `${id} (Codex CLI)`,
    owned_by: 'openai',
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
        '[cli-codex] `codex` not found on PATH. Install with: npm i -g @openai/codex && codex login',
      );
    }
    return ok;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-codex uses the local Codex CLI — install @openai/codex and run `codex login` (not a browser login).',
    );
  }

  async logout(): Promise<void> {
    logger.info('[cli-codex] local CLI — nothing to disconnect');
  }

  private async _run(req: ChatRequest): Promise<string> {
    const binPath = resolveExecutable(BIN);
    if (!binPath) {
      throw new Error(
        'codex CLI not found on PATH. Install with: npm i -g @openai/codex && codex login',
      );
    }

    const model = stripPrefix(req.model, PREFIX);
    const prompt = flattenMessages(req.messages);
    const effort = toOpenAiEffort(req.effort);

    // codex exec: final agent message on stdout; progress on stderr.
    // Prompt via stdin (`-`) to avoid ARG_MAX / Windows cmd length limits.
    // read-only sandbox + skip git check so chat-proxy use works outside a repo.
    // reasoning_effort via -c for GPT-5.x reasoning models.
    const args = [
      'exec',
      '-m', model,
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--ephemeral',
      ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : []),
      '-',
    ];

    const result = await runCli({
      binPath,
      args,
      stdin: prompt,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: homedir(),
      label: 'cli-codex',
      log: msg => logger.info(msg),
    });

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      const detail =
        result.timedOut || result.exitCode === 143
          ? `timeout: codex killed by supervisor (exit ${result.exitCode})`
          : result.stderr || '(no output)';
      throw new Error(`codex exited ${result.exitCode}: ${detail}`);
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
