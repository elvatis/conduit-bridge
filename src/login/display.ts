// Graphical-session probe for browser login and session restore.
//
// A local desktop can show Chromium directly. A remote Linux server can use
// Xvfb and Conduit's built-in CDP viewer over port 31338. No VNC component or
// second user-facing listener is required.

import { execFile } from 'node:child_process';
import { hostname as osHostname } from 'node:os';
import { readlinkSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export interface ProfileLockInfo {
  present: boolean;
  /** False when the lock names another machine. */
  hostnameMatches: boolean;
  /** True when the owner is gone or the lock belongs to another machine. */
  stale: boolean;
}

export interface DisplayProbe {
  /** True when Chromium can render on the configured graphical session. */
  ok: boolean;
  /** Sanitized reason when `ok` is false. */
  reason?: string;
  display: string | null;
  wayland: boolean;
  /** The X server accepted a connection. */
  xReachable: boolean;
  /** A window manager is running. It is optional for the built-in viewer. */
  windowManager: boolean;
  /** xprop is installed, which improves local display diagnostics. */
  windowToolsAvailable: boolean;
  /** Full Chromium binary used for ordinary headed processes. */
  headfulBinary: string | null;
  /** Null when no profile directory was supplied. */
  profileLock: ProfileLockInfo | null;
  /** Advice the dashboard can show, already plain-language. */
  warnings: string[];
}

export interface ProbeDeps {
  env?: NodeJS.ProcessEnv;
  run?: (file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<{ ok: boolean; stdout: string }>;
  hostname?: () => string;
  /** Resolves the full Chromium binary; returns null when unavailable. */
  resolveHeadfulBinary?: () => string | null;
  readProfileLock?: (profileDirPath: string) => { host: string; pid: number } | null;
  processAlive?: (pid: number) => boolean;
}

function defaultRun(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ ok: boolean; stdout: string }> {
  return new Promise(resolve => {
    execFile(file, args, { env, timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout ?? '') });
    });
  });
}

/** Reads Chromium's SingletonLock symlink, which encodes hostname and pid. */
function defaultReadProfileLock(profileDirPath: string): { host: string; pid: number } | null {
  const lock = join(profileDirPath, 'SingletonLock');
  try {
    lstatSync(lock);
    const target = readlinkSync(lock);
    const idx = target.lastIndexOf('-');
    if (idx <= 0) return { host: target, pid: 0 };
    return { host: target.slice(0, idx), pid: Number(target.slice(idx + 1)) || 0 };
  } catch {
    return null;
  }
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

function defaultResolveHeadfulBinary(): string | null {
  try {
    const requireFrom = createRequire(import.meta.url);
    const { chromium } = requireFrom('playwright') as typeof import('playwright');
    const path = chromium.executablePath();
    return path && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

export async function probeDisplay(
  profileDirPath?: string,
  deps: ProbeDeps = {},
): Promise<DisplayProbe> {
  try {
    return await runProbe(profileDirPath, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `The graphical session could not be checked: ${message.replace(/\s+/g, ' ').slice(0, 160)}`,
      display: deps.env?.DISPLAY ?? process.env.DISPLAY ?? null,
      wayland: Boolean(deps.env?.WAYLAND_DISPLAY ?? process.env.WAYLAND_DISPLAY),
      xReachable: false,
      windowManager: false,
      windowToolsAvailable: false,
      headfulBinary: null,
      profileLock: null,
      warnings: [],
    };
  }
}

async function runProbe(profileDirPath: string | undefined, deps: ProbeDeps): Promise<DisplayProbe> {
  const env = deps.env ?? process.env;
  const run = deps.run ?? defaultRun;
  const hostname = deps.hostname ?? osHostname;
  const readLock = deps.readProfileLock ?? defaultReadProfileLock;
  const alive = deps.processAlive ?? defaultProcessAlive;
  const resolveBinary = deps.resolveHeadfulBinary ?? defaultResolveHeadfulBinary;
  const display = env.DISPLAY ?? null;
  const wayland = Boolean(env.WAYLAND_DISPLAY);
  const headfulBinary = resolveBinary();
  const warnings: string[] = [];

  let xReachable = false;
  let windowManager = false;
  let windowToolsAvailable = false;
  if (display) {
    const xEnv = { ...env, DISPLAY: display };
    const info = await run('xdpyinfo', ['-display', display], xEnv, 4000);
    xReachable = info.ok && info.stdout.includes('screen #');
    const wm = await run('xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'], xEnv, 4000);
    windowToolsAvailable = wm.ok || wm.stdout.length > 0;
    windowManager = wm.ok && !/not found/i.test(wm.stdout) && /window id/i.test(wm.stdout);
  } else if (wayland) {
    xReachable = true;
    windowManager = true;
  }

  let profileLock: ProfileLockInfo | null = null;
  if (profileDirPath) {
    const lock = readLock(profileDirPath);
    if (!lock) {
      profileLock = { present: false, hostnameMatches: true, stale: false };
    } else {
      const matches = lock.host === hostname();
      profileLock = { present: true, hostnameMatches: matches, stale: matches ? !alive(lock.pid) : true };
    }
  }

  let ok = true;
  let reason: string | undefined;
  if (!display && !wayland) {
    ok = false;
    reason = 'No graphical session is available. On a remote Linux server, start Xvfb for Conduit Bridge.';
  } else if (display && !xReachable && !wayland) {
    ok = false;
    reason = `The graphical session ${display} is configured but is not responding.`;
  } else if (!headfulBinary) {
    ok = false;
    reason = 'Chromium is not installed. Run "npx playwright install chromium".';
  }

  if (ok && display && !windowManager) {
    warnings.push('No window manager was detected. The built-in browser viewer still works, but provider pop-up placement may vary.');
  }
  if (profileLock?.present && !profileLock.hostnameMatches) {
    warnings.push('This browser profile is marked as in use by another machine. Conduit will clear the stale marker before launch.');
  }

  return {
    ok,
    reason,
    display,
    wayland,
    xReachable,
    windowManager,
    windowToolsAvailable,
    headfulBinary,
    profileLock,
    warnings,
  };
}
