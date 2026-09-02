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
  agentCwd,
  DEFAULT_CLI_TIMEOUT_MS,
  argvLimitFor,
} from './cli-util.js';
import { basename } from 'node:path';
import { cliSession } from './cli-auth.js';
import { toAgyEffort } from '../effort.js';
import { cliPermissionArgs } from '../cli-mode.js';

// Google Antigravity CLI binary is `agy` (install scripts from antigravity.google).
// Non-interactive: agy -p/--print with --model and --output-format text.
// Fallback: legacy `gemini` binary if still on PATH.
// Docs: https://antigravity.google/docs/cli/getting-started
const PREFIX = 'cli-gemini/';

// Seed list only. The live catalog comes from `agy models` (see refreshModels);
// this is what we advertise before the first discovery answers, and when agy is
// missing or unauthenticated. Kept to the ids most likely to survive, because a
// hardcoded list is exactly what goes stale between agy releases.
const FALLBACK_CATALOG = ['gemini-3.1-pro-high', 'gemini-3.1-pro-low'];

/** Re-run `agy models` at most this often. */
const DISCOVERY_TTL_MS = 5 * 60_000;
const DISCOVERY_TIMEOUT_MS = 20_000;

/** agy encodes the reasoning tier in the model id, e.g. gemini-3.6-flash-low. */
const TIER_SUFFIX = /-(high|medium|low)$/;

/**
 * agy's two ways of refusing `--effort`, verified against the real binary:
 *   --model gemini-3.6-flash-low --effort high
 *     -> 'conflicts with --effort=high'
 *   --model claude-sonnet-4-6 --effort medium
 *     -> '--effort is not supported for model "claude-sonnet-4-6"'
 * Both exit 1 with empty stdout, so neither is survivable without a retry.
 */
export const EFFORT_REJECTED = /--effort is not supported|conflicts with --effort/i;

export interface AgyModel {
  id: string;
  displayName: string;
}

/**
 * Parse `agy models` stdout.
 *
 * The format is one "id<TAB>Display Name" per line, preceded by a
 * "Fetching available models..." status line. Requiring a tab (or a run of
 * spaces) as the separator is what keeps that prose line out of the catalog.
 */
export function parseAgyModels(stdout: string): AgyModel[] {
  const out: AgyModel[] = [];
  const seen = new Set<string>();
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^(\S+)(?:\t+| {2,})(\S.*)$/.exec(line);
    if (!match) continue;
    const [, id, displayName] = match;
    // Model ids are lowercase slugs with `-` and `.` as separators; anything
    // else is prose. The separator chars are deliberately kept OUT of the
    // segment class: overlapping them makes the two quantifiers ambiguous and
    // the pattern backtracks exponentially on input like "a-" + "..".
    if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, displayName: displayName.trim() });
  }
  return out;
}

function resolveGeminiBin(): string | null {
  // Prefer the current Antigravity CLI binary name.
  return resolveExecutable('agy')
    ?? resolveExecutable('gemini')
    ?? resolveExecutable('antigravity');
}

function toDefinition(m: AgyModel): ModelDefinition {
  return {
    id: `${PREFIX}${m.id}`,
    provider: 'cli-gemini',
    displayName: `${m.displayName || m.id} (agy CLI)`,
    owned_by: 'google',
  };
}

export class GeminiCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-gemini';

  private _discovered: ModelDefinition[] | null = null;
  private _discoveredAt = 0;

  /** Discovered catalog when we have one, otherwise the seed list. */
  get models(): ModelDefinition[] {
    if (this._discovered?.length) return this._discovered;
    return FALLBACK_CATALOG.map(id => toDefinition({ id, displayName: id }));
  }

  constructor(_cfg: BridgeConfig) {}

  /**
   * Ask agy which models it actually serves. Returns the number discovered.
   * Called by ProviderRegistry.refreshApiModels (POST /v1/models/refresh) and
   * opportunistically whenever we confirm the session.
   *
   * Never throws and never empties a good catalog: if agy is gone, offline or
   * logged out, the previously discovered list stays in place.
   */
  async refreshModels(force = false): Promise<number> {
    if (!force && this._discovered && Date.now() - this._discoveredAt < DISCOVERY_TTL_MS) {
      return this._discovered.length;
    }
    const binPath = resolveGeminiBin();
    if (!binPath || !/agy(\.exe)?$/i.test(binPath)) return this._discovered?.length ?? 0;

    try {
      const result = await runCli({
        binPath,
        args: ['models'],
        timeoutMs: DISCOVERY_TIMEOUT_MS,
        label: 'cli-gemini/models',
        log: msg => logger.info(msg),
      });
      if (result.exitCode !== 0) {
        logger.warn(`[cli-gemini] \`agy models\` exited ${result.exitCode}; keeping previous catalog`);
        return this._discovered?.length ?? 0;
      }
      const parsed = parseAgyModels(result.stdout);
      if (!parsed.length) {
        logger.warn('[cli-gemini] `agy models` returned no parsable rows; keeping previous catalog');
        return this._discovered?.length ?? 0;
      }
      this._discovered = parsed.map(toDefinition);
      this._discoveredAt = Date.now();
      logger.info(`[cli-gemini] discovered ${parsed.length} models from \`agy models\``);
      return parsed.length;
    } catch (err) {
      logger.warn(`[cli-gemini] model discovery failed: ${(err as Error).message}`);
      return this._discovered?.length ?? 0;
    }
  }

  get credentialSource(): string {
    return cliSession('gemini', ['agy', 'gemini', 'antigravity']).source;
  }

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    return cliSession('gemini', ['agy', 'gemini', 'antigravity']).authenticated;
  }

  async ensureConnected(): Promise<boolean> {
    const session = cliSession('gemini', ['agy', 'gemini', 'antigravity']);
    if (!session.installed) {
      logger.warn(
        '[cli-gemini] `agy` not found on PATH. Install Antigravity CLI ' +
          '(https://antigravity.google/docs/cli/getting-started) — binary name is `agy`.',
      );
      return false;
    }
    if (!session.authenticated) {
      logger.warn('[cli-gemini] Gemini CLI is installed but not authenticated.');
      return false;
    }
    // Opportunistically refresh the catalog while we know agy is usable, the way
    // the LM Studio provider does on a reachable server. TTL-guarded, so this is
    // a no-op on all but the first call in a five-minute window.
    void this.refreshModels().catch(() => {});
    return true;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-gemini uses the local Antigravity CLI (`agy`) — install and authenticate there ' +
        'using the CLI-supported authentication flow.',
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
    const mode = req.mode ?? 'chat';
    const permission = cliPermissionArgs('cli-gemini', mode, { isAgy });

    // agy's `-p` takes the prompt as an argv value and there is no stdin prompt
    // transport for text mode, so the command line is the hard bound here.
    // Fail with something the caller can act on rather than a bare ENAMETOOLONG.
    const argvLimit = argvLimitFor(binPath);
    if (prompt.length > argvLimit) {
      throw new Error(
        `cli-gemini: prompt is ${prompt.length} chars, over the ${argvLimit} command-line limit ` +
          `for \`${basename(binPath)} -p\` on this platform. Shorten the conversation or attach less context.`,
      );
    }

    // agy rejects --effort for two different reasons, both fatal (exit 1, empty
    // stdout): a tier-suffixed id "conflicts with --effort", and some models do
    // not support the flag at all. The suffix check avoids the common wasted
    // call; EFFORT_REJECTED below catches everything the shape cannot predict,
    // which matters now that the catalog is discovered rather than hardcoded.
    const effort = TIER_SUFFIX.test(model) ? undefined : toAgyEffort(req.effort);

    // agy ignores the process cwd entirely — it runs in its own fixed scratch
    // directory (~/.gemini/antigravity-cli/scratch) and cannot see the caller's
    // files. --add-dir is what actually points it at the workspace, so without
    // this the editor's open folder is invisible to every cli-gemini turn.
    const workspace = agentCwd(req);

    // agy: -p/--print, --model, --output-format, --mode plan|accept-edits, --effort
    // legacy gemini: -p, -m, -o text, --approval-mode plan
    const buildArgs = (withEffort: string | undefined): string[] => isAgy
      ? [
          '-p', prompt,
          '--model', model,
          '--output-format', 'text',
          '--add-dir', workspace,
          ...permission,
          ...(withEffort ? ['--effort', withEffort] : []),
        ]
      : [
          '-p', prompt,
          '-m', model,
          '-o', 'text',
          ...permission,
        ];

    const invoke = (args: string[]) => runCli({
      binPath,
      args,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: workspace,
      label: 'cli-gemini',
      log: msg => logger.info(msg),
      signal: req.signal,
    });

    let result = await invoke(buildArgs(effort));

    // Self-heal rather than fail the turn: any model agy adds later may or may
    // not take --effort, and its own stderr is the only reliable oracle.
    if (effort && result.exitCode !== 0 && EFFORT_REJECTED.test(result.stderr)) {
      logger.warn(
        `[cli-gemini] ${model} rejected --effort ${effort}; retrying without it`,
      );
      result = await invoke(buildArgs(undefined));
    }

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      const detail =
        result.aborted
          ? 'client disconnected: process terminated'
          : result.timedOut || result.exitCode === 143
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
