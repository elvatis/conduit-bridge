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
  agentCwd,
  DEFAULT_CLI_TIMEOUT_MS,
} from './cli-util.js';
import { cliSession } from './cli-auth.js';
import { toClaudeEffort } from '../effort.js';
import { cliPermissionArgs } from '../cli-mode.js';
import { CLI_ACCOUNTS, claudeAccountEnv, parseClaudeModel } from './cli-account.js';

// Anthropic Claude Code CLI (@anthropic-ai/claude-code) — non-interactive via -p/--print.
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

  readonly models: ModelDefinition[] = [
    ...CATALOG.map(id => ({
      id: `${PREFIX}${id}`,
      provider: 'cli-claude' as ProviderName,
      displayName: `${id} (Claude Code CLI, first-account)`,
      owned_by: 'anthropic',
    })),
    ...CLI_ACCOUNTS.flatMap(account => CATALOG.map(id => ({
      id: `${PREFIX}${account}/${id}`,
      provider: 'cli-claude' as ProviderName,
      displayName: `${id} (Claude Code CLI, ${account})`,
      owned_by: 'anthropic',
    }))),
  ];

  constructor(_cfg: BridgeConfig) {}

  get credentialSource(): string {
    return cliSession('claude', [BIN]).source;
  }

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    return cliSession('claude', [BIN]).authenticated;
  }

  async ensureConnected(): Promise<boolean> {
    const session = cliSession('claude', [BIN]);
    if (!session.installed) {
      logger.warn(
        '[cli-claude] `claude` not found on PATH. Install with: npm i -g @anthropic-ai/claude-code',
      );
      return false;
    }
    if (!session.authenticated) {
      logger.warn('[cli-claude] `claude` is installed but not authenticated. Run `claude login`.');
      return false;
    }
    return true;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-claude uses the local Claude Code CLI — install @anthropic-ai/claude-code and authenticate ' +
        '(for example, claude login or the CLI-supported credential flow).',
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

    const accountModel = parseClaudeModel(req.model, PREFIX);
    const model = accountModel.model;
    const prompt = flattenMessages(req.messages);
    const effort = toClaudeEffort(req.effort);
    const mode = req.mode ?? 'chat';

    // -p/--print: non-interactive. --output-format text: plain assistant text.
    // Permission flags come from cliPermissionArgs (plan vs bypassPermissions).
    // --effort: Claude Code reasoning effort (low|medium|high|xhigh|max).
    const args = [
      '-p',
      '--output-format', 'text',
      '--model', model,
      ...cliPermissionArgs('cli-claude', mode),
      ...(effort ? ['--effort', effort] : []),
      prompt,
    ];

    const result = await runCli({
      binPath,
      args,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: agentCwd(req),
      env: claudeAccountEnv(accountModel.account),
      label: 'cli-claude',
      log: msg => logger.info(msg),
      signal: req.signal,
    });

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      const detail =
        result.aborted
          ? 'client disconnected: process terminated'
          : result.timedOut || result.exitCode === 143
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
