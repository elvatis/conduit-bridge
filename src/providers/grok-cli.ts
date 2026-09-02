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
import { catalogFor, isPinned } from '../model-catalog.js';

const PREFIX = 'cli-grok/';


const DISCOVERY_TTL_MS = 5 * 60_000;
const DISCOVERY_RETRY_MS = 60_000;
const DISCOVERY_TIMEOUT_MS = 20_000;

export { flattenMessages };

/**
 * Parse `grok models` stdout.
 *
 * Unlike agy's tab-separated table, grok prints prose and then a bullet list:
 *
 *   You are logged in with grok.com.
 *
 *   Default model: grok-4.6
 *
 *   Available models:
 *     * grok-4.6 (default)
 *     - grok-4.5
 *
 * Only lines after the "Available models:" header count, which keeps the
 * "Default model:" line from being read as a catalog entry.
 */
export function parseGrokModels(stdout: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inList = false;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!inList) {
      if (/^available models:/i.test(line)) inList = true;
      continue;
    }
    if (!line) continue;
    const match = /^[*\-•]\s+(\S+)/.exec(line);
    if (!match) break; // list ended
    const id = match[1];
    // Separators stay out of the segment class — an overlapping pattern
    // backtracks exponentially on hostile input (see parseAgyModels).
    if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function toDefinition(id: string): ModelDefinition {
  return {
    id: `${PREFIX}${id}`,
    provider: 'cli-grok',
    displayName: `${id} (Grok CLI)`,
    owned_by: 'xai',
  };
}

export class GrokCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-grok';

  private _discovered: ModelDefinition[] | null = null;
  private _attemptedAt = 0;
  private _inFlight: Promise<number> | null = null;

  /** Discovered catalog when we have one, otherwise the seed list. */
  get models(): ModelDefinition[] {
    // A pinned catalog is the user's explicit answer and outranks discovery.
    if (!isPinned('cli-grok') && this._discovered?.length) return this._discovered;
    // Seed list from model-catalog.ts, overridable via ~/.conduit/models.json.
    return catalogFor('cli-grok').map(m => toDefinition(m.id));
  }

  constructor(_cfg: BridgeConfig) {}

  /**
   * Ask grok which models it serves. Reached by ProviderRegistry.refreshApiModels
   * (POST /v1/models/refresh) and opportunistically once the session is known
   * good. Never throws, and never empties a catalog we already have.
   */
  async refreshModels(force = false): Promise<number> {
    const ttl = this._discovered ? DISCOVERY_TTL_MS : DISCOVERY_RETRY_MS;
    if (!force && Date.now() - this._attemptedAt < ttl) {
      return this._discovered?.length ?? 0;
    }
    if (this._inFlight) return this._inFlight;
    this._attemptedAt = Date.now();
    this._inFlight = this._discover().finally(() => { this._inFlight = null; });
    return this._inFlight;
  }

  private async _discover(): Promise<number> {
    // A pinned catalog is the user's explicit answer; do not overwrite it.
    if (isPinned('cli-grok')) return catalogFor('cli-grok').length;
    const binPath = resolveExecutable('grok');
    if (!binPath) return this._discovered?.length ?? 0;
    try {
      const result = await runCli({
        binPath,
        args: ['models'],
        timeoutMs: DISCOVERY_TIMEOUT_MS,
        label: 'cli-grok/models',
        log: msg => logger.info(msg),
      });
      if (result.exitCode !== 0) {
        logger.warn(`[cli-grok] \`grok models\` exited ${result.exitCode}; keeping previous catalog`);
        return this._discovered?.length ?? 0;
      }
      const ids = parseGrokModels(result.stdout);
      if (!ids.length) {
        logger.warn('[cli-grok] `grok models` returned no parsable rows; keeping previous catalog');
        return this._discovered?.length ?? 0;
      }
      this._discovered = ids.map(toDefinition);
      logger.info(`[cli-grok] discovered ${ids.length} models from \`grok models\``);
      return ids.length;
    } catch (err) {
      logger.warn(`[cli-grok] model discovery failed: ${(err as Error).message}`);
      return this._discovered?.length ?? 0;
    }
  }

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
    // TTL-guarded, so this is a no-op on all but the first call in the window.
    void this.refreshModels().catch(() => {});
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
