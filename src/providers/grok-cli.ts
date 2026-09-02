import { randomBytes } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { cliPermissionArgs } from '../cli-mode.js';

const PREFIX = 'cli-grok/';
const CATALOG = ['grok-4.6', 'grok-4.5', 'grok-4.3'];

export { flattenMessages };

export class GrokCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-grok';

  readonly models: ModelDefinition[] = CATALOG.map(id => ({
    id: `${PREFIX}${id}`,
    provider: 'cli-grok',
    displayName: `${id} (Grok CLI)`,
    owned_by: 'xai',
  }));

  constructor(_cfg: BridgeConfig) {}

  get credentialSource(): string {
    return cliSession('grok', ['grok']).source;
  }

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    return cliSession('grok', ['grok']).authenticated;
  }

  async ensureConnected(): Promise<boolean> {
    const session = cliSession('grok', ['grok']);
    if (!session.installed) {
      logger.warn('[cli-grok] `grok` CLI not found on PATH. Install it and run `grok login`.');
      return false;
    }
    if (!session.authenticated) {
      logger.warn('[cli-grok] `grok` is installed but not authenticated. Run `grok login`.');
      return false;
    }
    return true;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-grok uses the local Grok CLI — install it and authenticate with `grok login`.',
    );
  }

  async logout(): Promise<void> {
    logger.info('[cli-grok] local CLI — nothing to disconnect');
  }

  private _toApiModel(pluginId: string): string {
    return pluginId.startsWith(PREFIX) ? pluginId.slice(PREFIX.length) : pluginId;
  }

  private async _run(req: ChatRequest): Promise<string> {
    const binPath = resolveExecutable('grok');
    if (!binPath) {
      throw new Error('grok CLI not found on PATH. Install the Grok CLI and run `grok login`.');
    }

    const model = this._toApiModel(req.model);
    const prompt = flattenMessages(req.messages);
    const promptFile = join(tmpdir(), `conduit-grok-${randomBytes(12).toString('hex')}.txt`);
    writeFileSync(promptFile, prompt, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

    const effortRaw = req.effort?.trim().toLowerCase();
    const effort =
      !effortRaw ? undefined
      : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effortRaw)
        ? effortRaw
        : 'medium';

    const mode = req.mode ?? 'chat';
    const args = [
      '--prompt-file', promptFile,
      '--model', model,
      '--output-format', 'plain',
      ...cliPermissionArgs('cli-grok', mode),
      ...(effort ? ['--reasoning-effort', effort] : []),
    ];

    try {
      const result = await runCli({
        binPath,
        args,
        timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
        cwd: agentCwd(req),
        label: 'cli-grok',
        log: msg => logger.info(msg),
        signal: req.signal,
      });
      if (result.exitCode !== 0 && result.stdout.length === 0) {
        const detail =
          result.aborted
            ? 'client disconnected: process terminated'
            : result.timedOut || result.exitCode === 143
            ? `timeout: grok killed by supervisor (exit ${result.exitCode})`
            : result.stderr || '(no output)';
        throw new Error(`grok exited ${result.exitCode}: ${detail}`);
      }
      return result.stdout || result.stderr;
    } finally {
      try { unlinkSync(promptFile); } catch { /* best effort */ }
    }
  }

  async chat(req: ChatRequest): Promise<string> {
    return this._run(req);
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const content = await this._run(req);
    if (content) yield content;
  }
}
