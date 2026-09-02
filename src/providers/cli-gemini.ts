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
import { catalogFor, noteForeignVendors, isPinned, SERVED_BY, limitsFor } from '../model-catalog.js';

// Google Antigravity CLI binary is `agy` (install scripts from antigravity.google).
// Non-interactive: agy -p/--print with --model and --output-format text.
// Fallback: legacy `gemini` binary if still on PATH.
// Docs: https://antigravity.google/docs/cli/getting-started
const PREFIX = 'cli-gemini/';


/** Re-run `agy models` at most this often. */
const DISCOVERY_TTL_MS = 5 * 60_000;
/** Shorter window before retrying a discovery that failed. */
const DISCOVERY_RETRY_MS = 60_000;
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
 * One NDJSON line carrying the prompt, for `--input-format stream-json`.
 *
 * agy's `-p` takes the prompt as an argv value, which Windows caps at 32767
 * characters for the whole command line — nowhere near enough for coding, where
 * the prompt carries files. stdin has no such ceiling: verified against the real
 * binary, a 141495-character prompt arrives whole, tail included.
 */
export function agyStreamInput(prompt: string): string {
  return JSON.stringify({ event: 'user', message: { role: 'user', content: prompt } }) + '\n';
}

/**
 * Pull the assistant text out of agy's `--output-format stream-json` frames.
 *
 * The run ends with `{"event":"result","result":{status,response,error}}`.
 * A non-SUCCESS status carries the reason in `error`, which is where the
 * effort-rejection message now appears instead of on stderr.
 */
export function parseAgyStream(stdout: string): { text: string; error?: string } {
  let text = '';
  let error: string | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let frame: { event?: string; result?: { status?: string; response?: string; error?: string } };
    try {
      frame = JSON.parse(line);
    } catch {
      continue; // not every line is a frame
    }
    if (frame.event !== 'result' || !frame.result) continue;
    if (typeof frame.result.response === 'string') text = frame.result.response;
    if (frame.result.status && frame.result.status !== 'SUCCESS') {
      error = frame.result.error || `agy reported ${frame.result.status}`;
    }
  }
  return { text: text.trim(), error };
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

/** The Antigravity binary, as opposed to the legacy `gemini` fallback. */
export function isAgyBin(binPath: string): boolean {
  return /agy(\.exe)?$/i.test(binPath);
}

/**
 * How much prompt agy accepts on stdin.
 *
 * Not an OS limit — agy's own. Measured end to end through the bridge against
 * the real binary, asking for a marker on the last line so truncation is
 * visible rather than silent:
 *
 *   181722 chars  tail arrived
 *   192576 chars  tail arrived
 *   203363 chars  "The input was truncated before reaching a final line"
 *   257365 chars  truncated
 *
 * So agy cuts somewhere just past 200000. This sits below the last measured
 * success with room to spare, because the failure mode is a silently dropped
 * tail — the same class of bug as the cmd.exe truncation this transport
 * replaced, and the reason the prompt is worth bounding at all rather than
 * reporting no ceiling.
 */
export const AGY_STDIN_LIMIT = 180_000;

function resolveGeminiBin(): string | null {
  // Prefer the current Antigravity CLI binary name.
  return resolveExecutable('agy')
    ?? resolveExecutable('gemini')
    ?? resolveExecutable('antigravity');
}

function toDefinition(m: AgyModel): ModelDefinition {
  const binPath = resolveGeminiBin();
  return {
    id: `${PREFIX}${m.id}`,
    provider: 'cli-gemini',
    displayName: `${m.displayName || m.id} (agy CLI)`,
    owned_by: SERVED_BY['cli-gemini'],
    // Both transports bound the prompt, just very differently. The legacy
    // `gemini` binary puts it on argv, so the OS command line caps it at ~30000
    // on Windows. agy takes it on stdin as stream-json and cuts at its own,
    // roughly 6x higher limit. Either way the tail is dropped silently, so the
    // number has to reach the client.
    ...(binPath
      ? { maxPromptChars: isAgyBin(binPath) ? AGY_STDIN_LIMIT : argvLimitFor(binPath) }
      : {}),
    ...limitsFor('cli-gemini', m.id),
  };
}

export class GeminiCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-gemini';

  private _discovered: ModelDefinition[] | null = null;
  /** Last ATTEMPT, not last success — a failing agy must not be re-spawned per request. */
  private _attemptedAt = 0;
  private _inFlight: Promise<number> | null = null;

  /** Discovered catalog when we have one, otherwise the seed list. */
  get models(): ModelDefinition[] {
    // A pinned catalog is the user's explicit answer and outranks discovery.
    if (!isPinned('cli-gemini') && this._discovered?.length) return this._discovered;
    // Seed list from model-catalog.ts (overridable via ~/.conduit/models.json):
    // what we advertise before the first `agy models` answers, and when agy is
    // missing or logged out.
    return catalogFor('cli-gemini').map(m => toDefinition({ id: m.id, displayName: m.displayName ?? m.id }));
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
    // Back off on ATTEMPTS, not successes. Keying the TTL off the last success
    // means a broken agy is re-spawned on every single chat completion, because
    // the short-circuit can never engage while _discovered is still null.
    const ttl = this._discovered ? DISCOVERY_TTL_MS : DISCOVERY_RETRY_MS;
    if (!force && Date.now() - this._attemptedAt < ttl) {
      return this._discovered?.length ?? 0;
    }
    // Collapse concurrent callers onto one process; ensureConnected() fires this
    // per request and four parallel ones spawned four `agy models`.
    if (this._inFlight) return this._inFlight;

    this._attemptedAt = Date.now(); // set before the first await
    this._inFlight = this._discover().finally(() => { this._inFlight = null; });
    return this._inFlight;
  }

  private async _discover(): Promise<number> {
    // A pinned catalog is the user's explicit answer; do not overwrite it.
    if (isPinned('cli-gemini')) return catalogFor('cli-gemini').length;
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
      // agy resells Anthropic and GPT-OSS models alongside Google's; all of them
      // are reachable through the Antigravity subscription, so all are advertised.
      const parsed = noteForeignVendors('cli-gemini', parseAgyModels(result.stdout));
      if (!parsed.length) {
        logger.warn('[cli-gemini] `agy models` returned no parsable rows; keeping previous catalog');
        return this._discovered?.length ?? 0;
      }
      this._discovered = parsed.map(toDefinition);
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
    const isAgy = isAgyBin(binPath);
    const mode = req.mode ?? 'chat';
    const permission = cliPermissionArgs('cli-gemini', mode, { isAgy });

    // agy's `-p` takes the prompt as an argv value and there is no stdin prompt
    // transport for text mode, so the command line is the hard bound here.
    // Fail with something the caller can act on rather than a bare ENAMETOOLONG.
    // Refuse rather than let a tail vanish. agy cuts its stdin input past about
    // 200000 chars and answers from what it did read, which reads as the model
    // ignoring the request — the same silent failure the cmd.exe path had.
    const promptLimit = isAgy ? AGY_STDIN_LIMIT : argvLimitFor(binPath);
    if (prompt.length > promptLimit) {
      throw new Error(
        `cli-gemini: prompt is ${prompt.length} chars, over the ${promptLimit} limit for ` +
          `\`${basename(binPath)}\`. Shorten the conversation or attach less context.`,
      );
    }

    // agy rejects --effort for two different reasons, both fatal (exit 1, empty
    // stdout): a tier-suffixed id "conflicts with --effort", and the models it
    // resells from other vendors do not support the flag at all. Predicting both
    // cheaply avoids a spawn that is certain to fail and be retried; stderr
    // (EFFORT_REJECTED, below) stays the oracle for anything agy adds later.
    const takesEffort = model.startsWith('gemini-') && !TIER_SUFFIX.test(model);
    const effort = takesEffort ? toAgyEffort(req.effort) : undefined;

    // agy ignores the process cwd entirely — it runs in its own fixed scratch
    // directory (~/.gemini/antigravity-cli/scratch) and cannot see the caller's
    // files. --add-dir is what actually points it at the workspace, so without
    // this the editor's open folder is invisible to every cli-gemini turn.
    const workspace = agentCwd(req);

    // agy: the prompt rides stdin as one NDJSON frame, so a coding prompt is
    //      bounded by the model's token window rather than by Windows' 32767-char
    //      command line. `-p=` (attached, empty) is what puts it in print mode
    //      without consuming the next argument as the prompt.
    // legacy gemini: no stream-json, so it keeps -p on argv.
    const buildArgs = (withEffort: string | undefined): string[] => isAgy
      ? [
          '--input-format', 'stream-json',
          '--output-format', 'stream-json',
          '--model', model,
          '--add-dir', workspace,
          ...permission,
          ...(withEffort ? ['--effort', withEffort] : []),
          '-p=',
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
      ...(isAgy ? { stdin: agyStreamInput(prompt) } : {}),
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: workspace,
      label: 'cli-gemini',
      log: msg => logger.info(msg),
      signal: req.signal,
    });

    let result = await invoke(buildArgs(effort));
    let parsed = isAgy ? parseAgyStream(result.stdout) : undefined;

    // Self-heal rather than fail the turn: any model agy adds later may or may
    // not take --effort. Under stream-json the refusal arrives in the result
    // frame rather than on stderr, so both are checked.
    const effortRefused = EFFORT_REJECTED.test(result.stderr)
      || EFFORT_REJECTED.test(parsed?.error ?? '');
    if (effort && effortRefused) {
      logger.warn(`[cli-gemini] ${model} rejected --effort ${effort}; retrying without it`);
      result = await invoke(buildArgs(undefined));
      parsed = isAgy ? parseAgyStream(result.stdout) : undefined;
    }

    if (parsed) {
      // stream-json can exit 0 and still report a failed run in its frame.
      if (!parsed.text) {
        const detail =
          result.aborted
            ? 'client disconnected: process terminated'
            : result.timedOut || result.exitCode === 143
            ? `timeout: agy killed by supervisor (exit ${result.exitCode})`
            : parsed.error || result.stderr || '(no output)';
        throw new Error(`cli-gemini exited ${result.exitCode}: ${detail}`);
      }
      return parsed.text;
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
