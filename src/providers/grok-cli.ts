import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import type {
  BridgeConfig,
  ProviderName,
  ChatRequest,
  ChatMessage,
  ModelDefinition,
  ProviderAdapter,
} from '../types.js';
import { logger } from '../logger.js';

// Grok CLI runs locally as the `grok` binary (xAI's CLI). This provider drives it
// in single-turn headless mode, delivering the prompt via --prompt-file (never on
// argv) to avoid E2BIG on long conversations. The binary must be installed and on
// PATH; the provider reports "not connected" otherwise.
//
// Ported from openclaw-cli-bridge-elvatis' runGrok(), with cross-platform binary
// resolution + Windows .cmd spawn handling added for conduit-bridge.
const PREFIX = 'cli-grok/';
const DEFAULT_TIMEOUT_MS = 300_000; // 5 min
const GRACE_MS = 5_000;

// Curated API/CLI model ids (docs.x.ai/developers/models, 2026-09). The
// unversioned grok-4.6 alias follows xAI's current flagship release.
// ownsModel still accepts any cli-grok/* for forward compatibility.
const CATALOG = ['grok-4.6', 'grok-4.5', 'grok-4.3'];

interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  aborted: boolean;
}

/** Locate an executable on PATH, honoring PATHEXT (.cmd/.exe/…) on Windows. */
function resolveExecutable(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      for (const cand of [name + ext, name + ext.toLowerCase()]) {
        const full = join(dir, cand);
        if (existsSync(full)) return full;
      }
    }
  }
  return null;
}

/** Minimal, safe env for the subprocess — avoids pushing argv+envp over ARG_MAX. */
function buildMinimalEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NO_COLOR: '1', TERM: 'dumb' };
  const keys = [
    'HOME', 'USERPROFILE', 'PATH', 'PATHEXT', 'USER', 'LOGNAME', 'SHELL',
    'TMPDIR', 'TMP', 'TEMP', 'ComSpec', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA',
    'XAI_API_KEY', 'GROK_API_KEY', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  ];
  for (const k of keys) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

function quoteWin(arg: string): string {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/** Spawn a CLI (prompt already on disk), with graceful SIGTERM → SIGKILL timeout. */
function runCli(
  binPath: string,
  args: string[],
  timeoutMs: number,
  cwd: string,
  log: (msg: string) => void,
  signal?: AbortSignal,
): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const lower = binPath.toLowerCase();
    const viaCmd = isWin && (lower.endsWith('.cmd') || lower.endsWith('.bat'));

    // .cmd/.bat can't be spawned directly on Windows; run them through cmd.exe.
    // The whole command is wrapped in ONE outer quote pair so cmd's `/s` strips
    // only that pair — leaving each quoted arg (e.g. a spaced install path or
    // temp-file path) intact. Without it, `/s` would strip binPath's opening
    // quote and the last arg's closing quote, corrupting the command line.
    const proc = viaCmd
      ? spawn(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', '"' + [binPath, ...args].map(quoteWin).join(' ') + '"'],
          { env: buildMinimalEnv(), cwd, windowsVerbatimArguments: true },
        )
      : spawn(binPath, args, { env: buildMinimalEnv(), cwd });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let closed = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      log(`[grok-cli] timeout after ${Math.round(timeoutMs / 1000)}s — terminating grok`);
      if (isWin && proc.pid !== undefined) {
        // `proc` may be the cmd.exe wrapper; /t kills the grok grandchild too and
        // /f forces it — otherwise grok is orphaned and 'close' never fires.
        try {
          spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
        } catch {
          proc.kill();
        }
      } else {
        proc.kill('SIGTERM');
        // Escalate to a hard kill if it hasn't exited after the grace window.
        // Gate on `closed`, NOT proc.killed (which flips true the instant a
        // signal is *sent*, which would make this escalation dead code).
        killTimer = setTimeout(() => {
          if (!closed) proc.kill('SIGKILL');
        }, GRACE_MS);
      }
    }, timeoutMs);

    const onAbort = () => {
      if (closed) return;
      aborted = true;
      log('[grok-cli] client disconnected — terminating grok');
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => { if (!closed) proc.kill('SIGKILL'); }, GRACE_MS);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();

    const clearTimers = () => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', code => {
      closed = true;
      clearTimers();
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0, timedOut, aborted });
    });
    proc.on('error', err => {
      closed = true;
      clearTimers();
      reject(new Error(`Failed to spawn 'grok': ${err.message}`));
    });
  });
}

/** Flatten OpenAI-style messages into a single transcript prompt for the CLI. */
export function flattenMessages(messages: ChatMessage[]): string {
  const system = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n')
    .trim();
  const convo = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n')
    .trim();
  return [system, convo].filter(Boolean).join('\n\n');
}

export class GrokCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'grok-cli';

  readonly models: ModelDefinition[] = CATALOG.map(id => ({
    id: `${PREFIX}${id}`,
    provider: 'grok-cli',
    displayName: `${id} (Grok CLI)`,
    owned_by: 'xai',
  }));

  // cfg accepted for registry uniformity; grok-cli configures itself from PATH + env.
  constructor(_cfg: BridgeConfig) {}

  /** Route any "cli-grok/…" model here. */
  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  /** "Connected" when the grok binary is resolvable on PATH. */
  async checkSession(): Promise<boolean> {
    return resolveExecutable('grok') !== null;
  }

  async ensureConnected(): Promise<boolean> {
    const ok = await this.checkSession();
    if (!ok) {
      logger.warn('[grok-cli] `grok` CLI not found on PATH. Install it and run `grok login`.');
    }
    return ok;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'grok-cli uses the local Grok CLI — install it and authenticate with `grok login` (not a browser login).',
    );
  }

  async logout(): Promise<void> {
    logger.info('[grok-cli] local CLI — nothing to disconnect');
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
    // Unique per-call name so concurrent requests never share a prompt file;
    // mode 0o600 + flag 'wx' keep it owner-only and refuse to follow a
    // pre-existing symlink at the path (CWE-377 hardening).
    const promptFile = join(tmpdir(), `conduit-grok-${randomBytes(12).toString('hex')}.txt`);
    writeFileSync(promptFile, prompt, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

    // Map effort -> grok --reasoning-effort (aliases --effort)
    const effortRaw = req.effort?.trim().toLowerCase();
    const effort =
      !effortRaw ? undefined
      : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effortRaw)
        ? effortRaw
        : 'medium';

    const args = [
      '--prompt-file', promptFile,
      '--model', model,
      '--output-format', 'plain',
      '--no-plan',
      '--always-approve',
      ...(effort ? ['--reasoning-effort', effort] : []),
    ];

    try {
      const result = await runCli(binPath, args, DEFAULT_TIMEOUT_MS, homedir(), msg => logger.info(msg), req.signal);
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

  // The Grok CLI is single-shot (no token streaming in --output-format plain),
  // so we yield the full result as one chunk.
  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const content = await this._run(req);
    if (content) yield content;
  }
}
