import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import type { ChatMessage } from '../types.js';

export const DEFAULT_CLI_TIMEOUT_MS = 300_000; // 5 min
export const CLI_GRACE_MS = 5_000;

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  aborted: boolean;
}

/** Locate an executable on PATH, honoring PATHEXT (.cmd/.exe/…) on Windows. */
export function resolveExecutable(name: string): string | null {
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

/** Minimal env for subprocesses — keeps ARG_MAX small and passes auth vars. */
export function buildMinimalEnv(extraKeys: string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NO_COLOR: '1', TERM: 'dumb' };
  const keys = [
    'HOME', 'USERPROFILE', 'PATH', 'PATHEXT', 'USER', 'LOGNAME', 'SHELL',
    'TMPDIR', 'TMP', 'TEMP', 'ComSpec', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    // Auth for coding CLIs
    'XAI_API_KEY', 'GROK_API_KEY',
    'OPENAI_API_KEY', 'CODEX_API_KEY',
    'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY',
    'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI',
    ...extraKeys,
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
  signal?: AbortSignal;
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

    const proc = viaCmd
      ? spawn(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', '"' + [binPath, ...args].map(quoteWin).join(' ') + '"'],
          {
            env: { ...buildMinimalEnv(), ...(opts.env ?? {}) },
            cwd,
            windowsVerbatimArguments: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        )
      : spawn(binPath, args, {
        env: { ...buildMinimalEnv(), ...(opts.env ?? {}) },
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
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
        proc.kill('SIGTERM');
        killTimer = setTimeout(() => { if (!closed) proc.kill('SIGKILL'); }, CLI_GRACE_MS);
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

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
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
