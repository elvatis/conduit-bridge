// ── Manual login handoff: an ordinary browser the person drives ──────────────
//
// Why this exists
// ---------------
// Every browser Playwright launches uses an automation transport. Chromium
// reports that honestly (`navigator.webdriver === true`),
// Cloudflare documents that automation frameworks are not supported for
// completing production security checks, and Google refuses sign-in in such a
// browser altogether. So for a *manual* login Conduit does not automate a
// browser at all: it starts the ordinary browser binary as a plain child
// process and steps back.
//
// The browser is honest about what it is:
//   - no remote-debugging port or pipe,
//   - no User-Agent override,
//   - no stealth flags,
//   - a normal window on the normal display, with a normal persistent profile.
//
// The only thing Conduit observes is the title of the window that is already
// visible to the person on that display, plus whether the process is alive.
// It never reads page content, never injects script, and never clicks anything.

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface ChildLike {
  readonly pid?: number;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
  /** 'exit' and 'error'; a real ChildProcess emits both. */
  once(event: 'exit' | 'error', listener: (arg: never) => void): unknown;
}

export interface WindowInfo {
  pid: number;
  title: string;
}

export interface HandoffDeps {
  spawnBrowser?: (file: string, args: string[], env: NodeJS.ProcessEnv) => ChildLike;
  readWindows?: (display: string) => Promise<WindowInfo[]>;
  processAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  removeStaleLock?: (profileDirPath: string) => boolean;
}

export interface HandoffOptions {
  /** Full (non-headless) browser binary. */
  executablePath: string;
  /** Persistent profile directory used again by the attached restore browser. */
  profileDirPath: string;
  /** Page the person signs in on. */
  url: string;
  /** X display or Wayland session to open the window on. */
  env: NodeJS.ProcessEnv;
  windowSize?: { width: number; height: number };
  /** Set when the caller already knows the sandbox cannot work here. */
  forceNoSandbox?: boolean;
}

export interface HandoffObservation {
  alive: boolean;
  /** Window title with the browser-name suffix stripped, or '' when unknown. */
  title: string;
  /** False when window tooling is unavailable, so a blank title means nothing. */
  titleAvailable: boolean;
}

const BROWSER_TITLE_SUFFIX = /\s+[-–]\s+(google chrome for testing|google chrome|chromium|chrome)\s*$/i;

// ── Default dependency implementations ───────────────────────────────────────

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultProcessAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string> {
  return new Promise(resolve => {
    execFile(file, args, { env, timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : String(stdout ?? ''));
    });
  });
}

/**
 * Lists the windows on a display with their owning pid and title.
 *
 * Works without a window manager: `xwininfo -root -children` enumerates the
 * root window's children directly, and `xprop` reads the standard properties
 * the browser sets on its own window.
 */
async function defaultReadWindows(display: string): Promise<WindowInfo[]> {
  const env = { ...process.env, DISPLAY: display };
  const tree = await run('xwininfo', ['-root', '-children'], env, 4000);
  if (!tree) return [];
  const ids = Array.from(tree.matchAll(/^\s+(0x[0-9a-f]+)/gim)).map(m => m[1]);
  const windows: WindowInfo[] = [];
  for (const id of ids.slice(0, 40)) {
    const props = await run('xprop', ['-id', id, '_NET_WM_PID', '_NET_WM_NAME', 'WM_NAME'], env, 3000);
    if (!props) continue;
    const pid = Number(/_NET_WM_PID\(CARDINAL\)\s*=\s*(\d+)/.exec(props)?.[1] ?? 0);
    const name =
      /_NET_WM_NAME\((?:UTF8_STRING|STRING)\)\s*=\s*"([\s\S]*?)"\s*$/m.exec(props)?.[1]
      ?? /WM_NAME\((?:UTF8_STRING|STRING)\)\s*=\s*"([\s\S]*?)"\s*$/m.exec(props)?.[1]
      ?? '';
    if (name) windows.push({ pid, title: name });
  }
  return windows;
}

/**
 * True when a profile-lock entry exists.
 *
 * Chromium's SingletonLock is a symlink whose target is the literal string
 * "<hostname>-<pid>" rather than a real path, so it is always dangling and
 * existsSync() — which follows symlinks — reports false for it. lstat is the
 * only check that sees it.
 */
export function lockEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes a Chromium profile lock left behind by a dead process, or by a
 * different machine (a shared home directory). Chromium otherwise refuses to
 * open the profile and shows a modal the person may never see.
 */
export function removeStaleProfileLocks(profileDirPath: string): boolean {
  let removed = false;
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const path = join(profileDirPath, name);
    try {
      if (lockEntryExists(path)) {
        rmSync(path, { force: true });
        removed = true;
      }
    } catch {
      // Leave it; the launch will report the real failure.
    }
  }
  return removed;
}

// ── Launch arguments ─────────────────────────────────────────────────────────

/**
 * The command line for the manual login browser.
 *
 * Deliberately minimal: a profile directory, first-run suppression, a window
 * size, and the page to open. Anything that would misrepresent the browser to
 * the site is absent by design, and so is anything that would put the browser
 * into an automation mode.
 */
export function manualLoginArgs(opts: {
  profileDirPath: string;
  url: string;
  windowSize?: { width: number; height: number };
  noSandbox?: boolean;
}): string[] {
  const size = opts.windowSize ?? { width: 1400, height: 900 };
  const args = [
    `--user-data-dir=${opts.profileDirPath}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${size.width},${size.height}`,
    '--window-position=0,0',
  ];
  if (opts.noSandbox) args.push('--no-sandbox');
  args.push(opts.url);
  return args;
}

// ── The browser ──────────────────────────────────────────────────────────────

export class ManualLoginBrowser {
  private _child: ChildLike | null = null;
  private _exited = false;
  private _exitCode: number | null = null;
  private _sandboxDisabled = false;
  private _spawnError: Error | null = null;
  private readonly _deps: Required<HandoffDeps>;

  constructor(private readonly _opts: HandoffOptions, deps: HandoffDeps = {}) {
    this._deps = {
      spawnBrowser: deps.spawnBrowser ?? ((file, args, env) =>
        spawn(file, args, { env, stdio: 'ignore', detached: false }) as unknown as ChildLike),
      readWindows: deps.readWindows ?? defaultReadWindows,
      processAlive: deps.processAlive ?? defaultProcessAlive,
      sleep: deps.sleep ?? defaultSleep,
      now: deps.now ?? Date.now,
      removeStaleLock: deps.removeStaleLock ?? removeStaleProfileLocks,
    };
  }

  get pid(): number | undefined { return this._child?.pid; }
  get sandboxDisabled(): boolean { return this._sandboxDisabled; }
  get exited(): boolean { return this._exited; }
  get exitCode(): number | null { return this._exitCode; }

  /**
   * Starts the browser. The Chromium sandbox is kept on where the host allows
   * it; when the sandbox cannot initialise (a common restriction on hardened
   * Linux hosts) the browser is restarted without it and the caller is told, so
   * the downgrade is visible rather than silent.
   */
  async start(): Promise<void> {
    this._deps.removeStaleLock(this._opts.profileDirPath);

    const attempt = (noSandbox: boolean): ChildLike => {
      const args = manualLoginArgs({
        profileDirPath: this._opts.profileDirPath,
        url: this._opts.url,
        windowSize: this._opts.windowSize,
        noSandbox,
      });
      const child = this._deps.spawnBrowser(this._opts.executablePath, args, this._opts.env);
      this._exited = false;
      this._exitCode = null;
      this._spawnError = null;
      child.once('exit', ((code: number | null) => { this._exited = true; this._exitCode = code; }) as (arg: never) => void);
      // A browser that cannot start reports it as an 'error' event. Without a
      // listener Node re-throws it as an uncaught exception and takes the whole
      // bridge down, so capture it and turn it into a normal failed login.
      try {
        child.once('error', ((err: Error) => {
          this._exited = true;
          this._spawnError = err;
        }) as (arg: never) => void);
      } catch { /* a test double without an 'error' channel */ }
      return child;
    };

    const wantSandbox = !this._opts.forceNoSandbox;
    this._child = attempt(!wantSandbox);
    this._sandboxDisabled = !wantSandbox;

    if (wantSandbox) {
      // A sandbox that cannot initialise kills the process almost immediately.
      await this._deps.sleep(2500);
      if (this._exited) {
        this._child = attempt(true);
        this._sandboxDisabled = true;
        await this._deps.sleep(1500);
      }
    }

    if (this._spawnError) {
      throw new Error(`The login browser could not be started: ${this._spawnError.message}`);
    }
    if (this._exited) {
      throw new Error(`The login browser closed immediately (exit code ${this._exitCode ?? 'unknown'}).`);
    }
  }

  /** Whether the browser is still running, and what its window says. */
  async observe(): Promise<HandoffObservation> {
    const pid = this._child?.pid ?? 0;
    const alive = !this._exited && this._deps.processAlive(pid);
    const display = this._opts.env.DISPLAY;
    if (!alive || !display) return { alive, title: '', titleAvailable: false };

    let windows: WindowInfo[] = [];
    try {
      windows = await this._deps.readWindows(display);
    } catch {
      return { alive, title: '', titleAvailable: false };
    }
    if (!windows.length) return { alive, title: '', titleAvailable: false };

    const browserWindows = windows.filter(w => BROWSER_TITLE_SUFFIX.test(w.title));
    // Chromium does not always own its window under the pid we spawned, so a
    // single unambiguous browser window is accepted as ours. Two or more means
    // another browser shares the display, and guessing would put someone
    // else's page title in front of this person.
    const own = browserWindows.find(w => w.pid === pid)
      ?? (browserWindows.length === 1 ? browserWindows[0] : undefined)
      ?? windows.find(w => w.pid === pid);
    if (!own) return { alive, title: '', titleAvailable: true };
    return { alive, title: own.title.replace(BROWSER_TITLE_SUFFIX, '').trim(), titleAvailable: true };
  }

  /**
   * Asks the browser to close, escalating only if it does not. Waits for the
   * profile lock to be released so a headless verification can open the same
   * profile straight afterwards.
   */
  async close(closeTimeoutMs = 10_000, profileReleaseMs = 15_000): Promise<void> {
    const child = this._child;
    if (!child) return;
    if (!this._exited) {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      const deadline = this._deps.now() + closeTimeoutMs;
      while (!this._exited && this._deps.now() < deadline) await this._deps.sleep(200);
      if (!this._exited) {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        const hardDeadline = this._deps.now() + 3_000;
        while (!this._exited && this._deps.now() < hardDeadline) await this._deps.sleep(200);
      }
    }
    await this._waitForProfileRelease(profileReleaseMs);
    this._child = null;
  }

  private async _waitForProfileRelease(timeoutMs: number): Promise<void> {
    const lock = join(this._opts.profileDirPath, 'SingletonLock');
    const deadline = this._deps.now() + timeoutMs;
    while (this._deps.now() < deadline) {
      if (!lockEntryExists(lock)) return;
      await this._deps.sleep(250);
    }
    // The browser is gone but the marker survived a crash — clear it so the
    // next open does not hit an invisible "profile in use" dialog.
    this._deps.removeStaleLock(this._opts.profileDirPath);
  }
}
