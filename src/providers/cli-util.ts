import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter, isAbsolute } from 'node:path';
import type {
  BridgeConfig,
  ChatMessage,
  ChatRequest,
  CliExecutableDiagnostic,
  CliProviderName,
} from '../types.js';

export const DEFAULT_CLI_TIMEOUT_MS = 300_000; // 5 min
export /** How long to wait after exit for the stdio streams to close on their own. */
const CLI_EXIT_GRACE_MS = 250;

const CLI_GRACE_MS = 5_000;
export const CLI_AUTH_ENV_KEYS: Record<CliProviderName, string[]> = {
  'cli-claude': ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'CLAUDE_CONFIG_DIR'],
  'cli-codex': ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_HOME'],
  'cli-gemini': ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI'],
  'cli-grok': ['XAI_API_KEY', 'GROK_API_KEY'],
};

/**
 * Largest prompt that may go on argv for a given binary.
 *
 * Prompts ride stdin wherever the CLI supports it; this bounds the ones that
 * can only take argv (agy). The ceiling is a property of the transport, not of
 * the bridge: Windows caps a CreateProcess command line at 32767 chars and
 * cmd.exe at 8191, while Linux allows 131072 per argument. Applying the Windows
 * number everywhere would reject prompts Linux handles fine.
 */
export function argvLimitFor(binPath: string): number {
  if (process.platform !== 'win32') return 120_000; // MAX_ARG_STRLEN is 131072
  const lower = binPath.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat')
    ? 7_000    // cmd.exe: 8191 for the whole line, leaving room for the flags
    : 30_000;  // CreateProcess: 32767 for the whole line
}

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  aborted: boolean;
}

let _sandbox: string | undefined;

/**
 * Empty scratch directory used when a request carries no usable workspace.
 *
 * Deliberately not the home directory: a coding CLI started in `homedir()` can
 * read and write the user's entire profile, which no caller ever asked for.
 */
export function sandboxCwd(): string {
  if (_sandbox && existsSync(_sandbox)) return _sandbox;
  try {
    // mkdtemp, not a fixed path: `mkdirSync(fixed, {recursive:true})` succeeds
    // on an already-existing directory and follows a symlink planted there, so
    // on a shared machine another account could choose the CLI's working
    // directory. mkdtemp creates a fresh 0700 directory or fails.
    _sandbox = mkdtempSync(join(tmpdir(), 'conduit-bridge-'));
    return _sandbox;
  } catch {
    return tmpdir();
  }
}

/**
 * CLI working directory from a chat request.
 *
 * Normally the folder open in the editor, which the client sends as `cwd`
 * (the VS Code extension takes it from `workspace.workspaceFolders[0]`).
 * Anything that is not an absolute existing path falls back to an empty
 * sandbox, so a missing `cwd` can never widen the CLI's reach to the profile.
 */
export function agentCwd(req: Pick<ChatRequest, 'cwd'>): string {
  const cwd = req.cwd?.trim();
  if (cwd && isAbsolute(cwd) && existsSync(cwd)) return cwd;
  return sandboxCwd();
}

function usableExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== 'win32') accessSync(path, constants.X_OK);
    if (process.platform === 'win32' && path.toLowerCase().endsWith('.ps1')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Locate a command on PATH, or validate an explicit absolute executable path. */
export function resolveExecutable(name: string): string | null {
  if (isAbsolute(name)) return usableExecutable(name) ? name : null;
  if (/[\\/]/.test(name)) return null;
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      for (const cand of [name + ext, name + ext.toLowerCase()]) {
        const full = join(dir, cand);
        if (usableExecutable(full)) return full;
      }
    }
  }
  return null;
}

/** Minimal environment. Provider secrets are included only through extraKeys. */
export function buildMinimalEnv(extraKeys: string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NO_COLOR: '1', TERM: 'dumb' };
  const keys = [
    'HOME', 'USERPROFILE', 'PATH', 'PATHEXT', 'USER', 'LOGNAME', 'SHELL',
    'TMPDIR', 'TMP', 'TEMP', 'ComSpec', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    ...extraKeys,
  ];
  for (const k of keys) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

export function quoteWin(arg: string): string {
  // An empty argument still has to occupy a slot. Emitted bare it disappears in
  // the join, and the flag before it silently swallows the next token instead.
  if (arg === '') return '""';
  // A literal quote can terminate the quoted argument and expose shell
  // metacharacters to cmd.exe. None of the supported CLI flags require one.
  if (/[\0\r\n"]/.test(arg)) {
    throw new Error('refusing an argument containing a quote or control character through cmd.exe');
  }
  return /[\s&|<>^()%!]/.test(arg) ? `"${arg}"` : arg;
}

export interface CliExecutableResolution {
  provider: CliProviderName;
  configured: boolean;
  requested: string;
  path: string | null;
  error?: string;
}

/**
 * Resolve a per-provider override or the provider's normal PATH candidates.
 * Overrides must be absolute so a changed service cwd cannot select a different
 * executable. Invalid overrides fail closed instead of falling back to PATH.
 */
export function resolveCliExecutable(
  cfg: Pick<BridgeConfig, 'cliExecutables'>,
  provider: CliProviderName,
  fallbacks: string[],
): CliExecutableResolution {
  const configured = cfg.cliExecutables?.[provider];
  if (configured !== undefined) {
    const requested = configured.trim();
    if (!requested || !isAbsolute(requested)) {
      return { provider, configured: true, requested, path: null, error: 'configured executable path must be absolute' };
    }
    const path = resolveExecutable(requested);
    if (!path) {
      return { provider, configured: true, requested, path: null, error: 'configured executable is missing, not a file, or not executable' };
    }
    return { provider, configured: true, requested, path };
  }
  for (const name of fallbacks) {
    const path = resolveExecutable(name);
    if (path) return { provider, configured: false, requested: fallbacks.join(', '), path };
  }
  return {
    provider,
    configured: false,
    requested: fallbacks.join(', '),
    path: null,
    error: `none of these commands were found on PATH: ${fallbacks.join(', ')}`,
  };
}

/** Read-only version probe used by provider diagnostics. */
export async function diagnoseCliExecutable(
  cfg: Pick<BridgeConfig, 'cliExecutables'>,
  provider: CliProviderName,
  fallbacks: string[],
): Promise<CliExecutableDiagnostic> {
  const resolved = resolveCliExecutable(cfg, provider, fallbacks);
  if (!resolved.path) {
    return {
      provider: resolved.provider,
      configured: resolved.configured,
      requested: resolved.requested,
      available: false,
      ...(resolved.error ? { error: resolved.error } : {}),
    };
  }
  const base = {
    provider: resolved.provider,
    configured: resolved.configured,
    requested: resolved.requested,
    path: resolved.path,
  };
  try {
    const result = await runCli({
      binPath: resolved.path,
      args: ['--version'],
      timeoutMs: 10_000,
      label: `${provider}/version`,
    });
    const version = (result.stdout || result.stderr).trim().split(/\r?\n/, 1)[0]?.slice(0, 200);
    if (result.exitCode !== 0) {
      return {
        ...base,
        available: false,
        error: version || `version probe exited ${result.exitCode}`,
      };
    }
    return { ...base, available: true, ...(version ? { version } : {}) };
  } catch (err) {
    return { ...base, available: false, error: (err as Error).message.slice(0, 300) };
  }
}

/**
 * Index of the first argument containing a newline, or -1.
 *
 * cmd.exe ends its `/c` command line at the first newline and discards the rest
 * — exit 0, no stderr. A multi-line prompt on argv therefore reaches the CLI as
 * its first line alone. Exported as a pure function so the guard is testable off
 * Windows.
 */
export function findMultilineArg(args: string[]): number {
  return args.findIndex(a => /[\r\n]/.test(a));
}

export interface RunCliOptions {
  binPath: string;
  args: string[];
  timeoutMs?: number;
  cwd?: string;
  /** If set, written to stdin and the stream is closed. */
  stdin?: string;
  log?: (msg: string) => void;
  label?: string;
  /** Explicit non-secret environment overrides, for isolated CLI accounts. */
  env?: NodeJS.ProcessEnv;
  /** Environment names required by this provider; excludes other providers' secrets. */
  envKeys?: string[];
  signal?: AbortSignal;
  /** Host-only observer for structured output. Observer failures do not stop the child. */
  onStdout?: (chunk: string) => void;
}

/** Spawn a CLI with graceful SIGTERM → SIGKILL timeout (Windows taskkill /T). */
export function runCli(opts: RunCliOptions): Promise<CliRunResult> {
  const {
    binPath,
    args,
    timeoutMs = DEFAULT_CLI_TIMEOUT_MS,
    cwd = process.cwd(),
    stdin,
    log = () => {},
    label = 'cli',
  } = opts;

  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const lower = binPath.toLowerCase();
    const viaCmd = isWin && (lower.endsWith('.cmd') || lower.endsWith('.bat'));

    // Prompts go on stdin now; fail loudly if a multi-line one comes back.
    if (viaCmd) {
      const multiline = findMultilineArg(args);
      if (multiline !== -1) {
        reject(new Error(
          `[${label}] refusing to pass a multi-line argument (index ${multiline}) through cmd.exe — ` +
            'it would be truncated at the first newline. Send it on stdin instead.',
        ));
        return;
      }
    }

    const proc = viaCmd
      ? spawn(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', '"' + [binPath, ...args].map(quoteWin).join(' ') + '"'],
          {
            env: { ...buildMinimalEnv(opts.envKeys), ...(opts.env ?? {}) },
            cwd,
            windowsVerbatimArguments: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        )
      : spawn(binPath, args, {
        env: { ...buildMinimalEnv(opts.envKeys), ...(opts.env ?? {}) },
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          // Makes the child a process group leader so the whole group can be
          // signalled. Without it a cancel reaches the child only, and
          // whatever the provider started survives it.
          detached: !isWin,
        });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let closed = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const terminate = (reason: 'timeout' | 'abort') => {
      if (closed) return;
      aborted = reason === 'abort';
      timedOut = reason === 'timeout';
      log(reason === 'abort' ? `[${label}] client disconnected — terminating` : `[${label}] timeout after ${Math.round(timeoutMs / 1000)}s — terminating`);
      if (isWin && proc.pid !== undefined) {
        try { spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' }); }
        catch { proc.kill(); }
      } else {
        // Negative pid means the process group. Falling back to the child
        // alone is better than not signalling at all, which is what happens
        // if the group is already gone.
        const signalGroup = (sig: NodeJS.Signals) => {
          if (proc.pid === undefined) return;
          try { process.kill(-proc.pid, sig); }
          catch { try { proc.kill(sig); } catch { /* already dead */ } }
        };
        signalGroup('SIGTERM');
        killTimer = setTimeout(() => { if (!closed) signalGroup('SIGKILL'); }, CLI_GRACE_MS);
      }
    };
    const timeoutTimer = setTimeout(() => terminate('timeout'), timeoutMs);
    const onAbort = () => terminate('abort');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    if (opts.signal?.aborted) onAbort();

    const clearTimers = () => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      opts.signal?.removeEventListener('abort', onAbort);
    };

    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => { stdout += chunk; try { opts.onStdout?.(chunk); } catch { /* observers cannot fail execution */ } });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    // 'close' fires when the stdio streams close, not when the child exits.
    // Anything still holding a pipe keeps the promise unsettled, which shows
    // up as a request that never returns. 'exit' is the backstop.
    proc.on('exit', code => {
      if (closed) return;
      setTimeout(() => {
        if (closed) return;
        closed = true;
        clearTimers();
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0, timedOut, aborted });
      }, CLI_EXIT_GRACE_MS).unref?.();
    });
    proc.on('close', code => {
      closed = true;
      clearTimers();
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0, timedOut, aborted });
    });
    proc.on('error', err => {
      closed = true;
      clearTimers();
      reject(new Error(`Failed to spawn '${label}': ${err.message}`));
    });

    // A child can exit before draining the pipe (rejected flag, auth failure, or
    // the timeout taskkill landing mid-write). Unhandled, that EPIPE is an
    // uncaught exception that takes the whole bridge down instead of failing
    // this one run.
    proc.stdin?.on('error', () => {});
    if (stdin !== undefined && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else if (proc.stdin) {
      proc.stdin.end();
    }
  });
}

/** Flatten OpenAI-style messages into a single transcript prompt. */
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

export function stripPrefix(pluginId: string, prefix: string): string {
  return pluginId.startsWith(prefix) ? pluginId.slice(prefix.length) : pluginId;
}
