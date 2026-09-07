import type {
  BridgeConfig,
  ProviderName,
  ChatRequest,
  ModelDefinition,
  ProviderAdapter,
} from '../types.js';
import { logger } from '../logger.js';
import { withCliSession, parseCliSessionOutput, type CliSessionLease } from '../session-registry.js';
import {
  diagnoseCliExecutable,
  resolveCliExecutable,
  runCli,
  flattenMessages,
  agentCwd,
  CLI_AUTH_ENV_KEYS,
  DEFAULT_CLI_TIMEOUT_MS,
} from './cli-util.js';
import { cliSession } from './cli-auth.js';
import { toClaudeEffort } from '../effort.js';
import { cliPermissionArgs } from '../cli-mode.js';
import { CLI_ACCOUNTS, claudeAccountEnv, parseClaudeModel } from './cli-account.js';
import { catalogFor, SERVED_BY, limitsFor } from '../model-catalog.js';

// Anthropic Claude Code CLI (@anthropic-ai/claude-code) — non-interactive via -p/--print.
// Install: npm i -g @anthropic-ai/claude-code  then authenticate (claude /login or API key)
// Docs: https://www.npmjs.com/package/@anthropic-ai/claude-code
const PREFIX = 'cli-claude/';
const BIN = 'claude';

export class ClaudeCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-claude';
  private readonly _cfg: BridgeConfig;

  /**
   * `claude` has no model-listing subcommand, so there is nothing to discover.
   * The catalog comes from src/model-catalog.ts, which reads `~/.conduit/models.json`
   * when present — a new model release needs an edited file, not a new build.
   * A getter, not a field, so an edit is picked up without a restart.
   */
  get models(): ModelDefinition[] {
    const catalog = catalogFor('cli-claude');
    return [
      ...catalog.map(m => ({
        id: `${PREFIX}${m.id}`,
        provider: 'cli-claude' as ProviderName,
        displayName: `${m.displayName ?? m.id} (Claude Code CLI, first-account)`,
        owned_by: SERVED_BY['cli-claude'],
        ...limitsFor('cli-claude', m.id),
      })),
      ...CLI_ACCOUNTS.flatMap(account => catalog.map(m => ({
        id: `${PREFIX}${account}/${m.id}`,
        provider: 'cli-claude' as ProviderName,
        displayName: `${m.displayName ?? m.id} (Claude Code CLI, ${account})`,
        owned_by: SERVED_BY['cli-claude'],
        ...limitsFor('cli-claude', m.id),
      }))),
    ];
  }

  constructor(cfg: BridgeConfig) { this._cfg = cfg; }

  private executable() {
    return resolveCliExecutable(this._cfg, 'cli-claude', [BIN]);
  }

  diagnostics() {
    return diagnoseCliExecutable(this._cfg, 'cli-claude', [BIN]);
  }

  get credentialSource(): string {
    const path = this.executable().path;
    return cliSession('claude', path ? [path] : []).source;
  }

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    const path = this.executable().path;
    return cliSession('claude', path ? [path] : []).authenticated;
  }

  async ensureConnected(): Promise<boolean> {
    const executable = this.executable();
    const session = cliSession('claude', executable.path ? [executable.path] : []);
    if (!session.installed) {
      logger.warn(
        `[cli-claude] ${executable.error ?? '`claude` not found on PATH. Install with: npm i -g @anthropic-ai/claude-code'}`,
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

  private async _run(req: ChatRequest, lease?: CliSessionLease): Promise<{ text: string; sessionId?: string }> {
    const executable = this.executable();
    const binPath = executable.path;
    if (!binPath) {
      throw new Error(
        `claude CLI unavailable: ${executable.error ?? 'not found on PATH'}`,
      );
    }

    const accountModel = parseClaudeModel(req.model, PREFIX);
    const model = accountModel.model;
    const prompt = flattenMessages(lease?.messages ?? req.messages);
    const effort = toClaudeEffort(req.effort);
    const mode = req.mode ?? 'chat';

    // -p/--print: non-interactive, reading the prompt from stdin.
    // Permission flags come from cliPermissionArgs (chat vs plan vs agent).
    // --effort: Claude Code reasoning effort (low|medium|high|xhigh|max).
    //
    // The prompt MUST stay off argv. `claude` resolves to claude.cmd on Windows,
    // so runCli routes it through `cmd.exe /c`, which ends the command line at
    // the first newline — a flattened transcript would arrive as its system
    // prompt alone, exit 0, no stderr, and the user's question silently gone.
    const args = [
      '-p',
      '--output-format', lease ? 'json' : 'text',
      ...(lease ? lease.sessionId ? ['--resume', lease.sessionId] : ['--session-id', lease.newSessionId] : []),
      '--model', model,
      ...cliPermissionArgs('cli-claude', mode, { disallowedTools: req.disallowedTools }),
      ...(effort ? ['--effort', effort] : []),
    ];

    const result = await runCli({
      binPath,
      args,
      stdin: prompt,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: agentCwd(req),
      env: claudeAccountEnv(accountModel.account),
      envKeys: CLI_AUTH_ENV_KEYS['cli-claude'],
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
    if (lease) {
      const parsed = parseCliSessionOutput('cli-claude', result.stdout);
      if (result.exitCode !== 0 || !parsed.text || result.aborted || result.timedOut) throw new Error('Claude session turn did not complete');
      return { text: parsed.text, sessionId: parsed.sessionId ?? lease.sessionId ?? lease.newSessionId };
    }
    return { text: result.stdout || result.stderr };
  }

  async chat(req: ChatRequest): Promise<string> {
    return withCliSession(req, 'cli-claude', this.executable().path ?? '', lease => this._run(req, lease));
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const content = await this.chat(req);
    if (content) yield content;
  }
}
