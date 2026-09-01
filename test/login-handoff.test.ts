import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ManualLoginBrowser,
  manualLoginArgs,
  type ChildLike,
  type HandoffDeps,
  type HandoffOptions,
  type WindowInfo,
} from '../src/login/handoff.js';

// ── Fakes ────────────────────────────────────────────────────────────────────
//
// No browser is ever spawned. Every seam handoff.ts exposes is injected, and
// the clock only moves when the injected sleep is awaited, so the whole file
// runs in the time it takes to resolve already-resolved promises.

class FakeChild implements ChildLike {
  exitCode: number | null = null;
  dead = false;
  spawnedAt = 0;
  /** Signal that actually ends this process; null means it ignores every one. */
  diesOn: NodeJS.Signals | null = 'SIGTERM';
  /** Milliseconds after spawn at which it dies on its own; null means it lives. */
  exitAfterMs: number | null = null;
  readonly signals: NodeJS.Signals[] = [];
  private readonly _listeners: Array<(code: number | null) => void> = [];

  constructor(readonly pid: number) {}

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal);
    if (this.diesOn && signal === this.diesOn) this.exit(0);
    return true;
  }

  once(_event: 'exit', listener: (code: number | null) => void): this {
    this._listeners.push(listener);
    return this;
  }

  exit(code: number | null): void {
    if (this.dead) return;
    this.dead = true;
    this.exitCode = code;
    for (const listener of this._listeners.splice(0)) listener(code);
  }
}

interface Spawn {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  child: FakeChild;
}

function makeHarness() {
  let clock = 1_000;
  let nextPid = 4100;
  const children: FakeChild[] = [];
  const spawns: Spawn[] = [];
  const sleeps: number[] = [];
  const order: string[] = [];

  const h = {
    children,
    spawns,
    sleeps,
    order,
    lockRemovals: 0,
    windows: [] as WindowInfo[],
    windowsThrow: false,
    /** Runs at every spawn so a test can decide that attempt's fate. */
    onSpawn: null as null | ((child: FakeChild, attempt: number) => void),
    /** Runs inside sleep, e.g. to let the browser release its profile lock. */
    onSleep: null as null | ((ms: number) => void),
    get clock() { return clock; },
    deps: {} as HandoffDeps,
  };

  h.deps = {
    spawnBrowser(file, args, env) {
      const child = new FakeChild(nextPid++);
      child.spawnedAt = clock;
      children.push(child);
      spawns.push({ file, args, env, child });
      order.push('spawn');
      h.onSpawn?.(child, spawns.length);
      return child;
    },
    async readWindows() {
      if (h.windowsThrow) throw new Error('xwininfo is not installed');
      return h.windows;
    },
    processAlive(pid) {
      return children.some(c => c.pid === pid && !c.dead);
    },
    sleep(ms) {
      sleeps.push(ms);
      clock += ms;
      h.onSleep?.(ms);
      for (const c of children) {
        if (!c.dead && c.exitAfterMs !== null && clock >= c.spawnedAt + c.exitAfterMs) c.exit(0);
      }
      return Promise.resolve();
    },
    now: () => clock,
    removeStaleLock() {
      h.lockRemovals++;
      order.push('lock');
      return true;
    },
  };

  return h;
}

const tempDirs: string[] = [];

function tempProfile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conduit-handoff-'));
  tempDirs.push(dir);
  return dir;
}

function options(over: Partial<HandoffOptions> = {}): HandoffOptions {
  return {
    executablePath: '/usr/bin/chromium',
    profileDirPath: '/nonexistent/conduit-profile',
    url: 'https://grok.com/',
    env: { DISPLAY: ':99' },
    ...over,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ── manualLoginArgs ──────────────────────────────────────────────────────────
//
// These assertions are the guarantee that the manual login browser is an
// ordinary browser: nothing here may put it into an automation mode or
// misrepresent it to the site the person is signing in to.

describe('manualLoginArgs', () => {
  const base = { profileDirPath: '/home/p/.conduit/grok', url: 'https://accounts.google.com/' };

  it('passes the profile, first-run suppression, a window size, and the URL last', () => {
    const args = manualLoginArgs(base);
    expect(args).toContain('--user-data-dir=/home/p/.conduit/grok');
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--no-default-browser-check');
    expect(args.some(a => a.startsWith('--window-size='))).toBe(true);
    // Chromium treats the first positional argument as the start page; a flag
    // added after it would be opened as a URL instead of parsed.
    expect(args.at(-1)).toBe('https://accounts.google.com/');
  });

  it('opens no debugging transport', () => {
    // Any remote-debugging transport makes Chromium report
    // navigator.webdriver === true, which is exactly the automation signal a
    // manual sign-in must not carry.
    const args = manualLoginArgs(base);
    expect(args.some(a => a.startsWith('--remote-debugging-port'))).toBe(false);
    expect(args).not.toContain('--remote-debugging-pipe');
    expect(args.join(' ')).not.toContain('remote-debugging');
  });

  it('does not hide the automation flag', () => {
    // We do not suppress the webdriver flag; we simply do not automate. A
    // stealth flag would be a claim about the browser that is not true.
    const args = manualLoginArgs(base);
    expect(args.some(a => a.startsWith('--disable-blink-features'))).toBe(false);
  });

  it('does not misrepresent the browser or the operating system', () => {
    const args = manualLoginArgs(base);
    expect(args.some(a => a.startsWith('--user-agent'))).toBe(false);
    // Case-sensitive on purpose: '--window-size' is legitimate, a spoofed
    // 'Windows NT' platform string in a UA override is not.
    expect(args.join(' ')).not.toMatch(/Windows/);
  });

  it('never runs headless', () => {
    // The person has to see and drive this window.
    const args = manualLoginArgs(base);
    expect(args.some(a => a.startsWith('--headless'))).toBe(false);
  });

  it('keeps the sandbox unless the caller asks for it to be dropped', () => {
    expect(manualLoginArgs(base)).not.toContain('--no-sandbox');
    expect(manualLoginArgs({ ...base, noSandbox: false })).not.toContain('--no-sandbox');
    expect(manualLoginArgs({ ...base, noSandbox: true })).toContain('--no-sandbox');
  });

  it('honours a custom window size', () => {
    const args = manualLoginArgs({ ...base, windowSize: { width: 1024, height: 768 } });
    expect(args).toContain('--window-size=1024,768');
  });

  it('falls back to a default window size', () => {
    expect(manualLoginArgs(base)).toContain('--window-size=1400,900');
  });
});

// ── ManualLoginBrowser: launching ────────────────────────────────────────────

describe('ManualLoginBrowser.start', () => {
  it('clears a stale profile lock before launching', async () => {
    // A lock left by a crashed browser makes Chromium show a modal the person
    // on a remote display may never see, so it has to go first, not after.
    const h = makeHarness();
    await new ManualLoginBrowser(options(), h.deps).start();
    expect(h.order[0]).toBe('lock');
    expect(h.order).toContain('spawn');
    expect(h.lockRemovals).toBe(1);
  });

  it('prefers the sandbox and keeps it when the browser survives', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    expect(h.spawns).toHaveLength(1);
    expect(h.spawns[0].args).not.toContain('--no-sandbox');
    expect(h.spawns[0].file).toBe('/usr/bin/chromium');
    expect(h.spawns[0].env.DISPLAY).toBe(':99');
    expect(browser.sandboxDisabled).toBe(false);
    expect(browser.exited).toBe(false);
    expect(browser.pid).toBe(h.spawns[0].child.pid);
  });

  it('retries without the sandbox and reports the downgrade', async () => {
    // A sandbox that cannot initialise kills the process at once. The retry is
    // fine; hiding it from the caller would not be.
    const h = makeHarness();
    h.onSpawn = (child, attempt) => { child.exitAfterMs = attempt === 1 ? 0 : null; };
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    expect(h.spawns).toHaveLength(2);
    expect(h.spawns[0].args).not.toContain('--no-sandbox');
    expect(h.spawns[1].args).toContain('--no-sandbox');
    expect(browser.sandboxDisabled).toBe(true);
    expect(browser.exited).toBe(false);
    expect(browser.pid).toBe(h.spawns[1].child.pid);
  });

  it('spawns once without probing when forceNoSandbox is set', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options({ forceNoSandbox: true }), h.deps);
    await browser.start();
    expect(h.spawns).toHaveLength(1);
    expect(h.spawns[0].args).toContain('--no-sandbox');
    expect(browser.sandboxDisabled).toBe(true);
    // No sandbox probe means no waiting: the caller already knew the answer.
    expect(h.sleeps).toHaveLength(0);
  });

  it('passes a custom window size through to the spawned command line', async () => {
    const h = makeHarness();
    await new ManualLoginBrowser(options({ windowSize: { width: 800, height: 600 } }), h.deps).start();
    expect(h.spawns[0].args).toContain('--window-size=800,600');
  });

  it('throws a clear error when the browser dies in both attempts', async () => {
    const h = makeHarness();
    h.onSpawn = child => { child.exitAfterMs = 0; };
    const browser = new ManualLoginBrowser(options(), h.deps);
    await expect(browser.start()).rejects.toThrow(/closed immediately/i);
    expect(h.spawns).toHaveLength(2);
    expect(browser.exited).toBe(true);
  });

  it('names the exit code in the failure message', async () => {
    const h = makeHarness();
    h.onSpawn = child => { child.exitAfterMs = 0; };
    await expect(new ManualLoginBrowser(options(), h.deps).start())
      .rejects.toThrow('The login browser closed immediately (exit code 0).');
  });
});

// ── ManualLoginBrowser: observing ────────────────────────────────────────────

describe('ManualLoginBrowser.observe', () => {
  it('reports the window title with the browser-name suffix stripped', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [{ pid: browser.pid ?? 0, title: 'Sign in - Google Accounts - Google Chrome for Testing' }];
    const seen = await browser.observe();
    expect(seen).toEqual({ alive: true, title: 'Sign in - Google Accounts', titleAvailable: true });
  });

  it('strips the plain Chromium suffix too', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [{ pid: browser.pid ?? 0, title: 'Grok - Chromium' }];
    expect((await browser.observe()).title).toBe('Grok');
  });

  it('prefers the window owned by its own child process', async () => {
    // Another browser on the same display must not be mistaken for ours.
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [
      { pid: 999, title: 'Someone else - Chromium' },
      { pid: browser.pid ?? 0, title: 'Just a moment... - Chromium' },
    ];
    expect((await browser.observe()).title).toBe('Just a moment...');
  });

  it('reports the title as unavailable when no window tooling answers', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [];
    // titleAvailable false is the honest signal: a blank title here means
    // "we could not look", not "the browser shows nothing".
    expect(await browser.observe()).toEqual({ alive: true, title: '', titleAvailable: false });
  });

  it('reports the title as unavailable when window tooling throws', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windowsThrow = true;
    const seen = await browser.observe();
    expect(seen.titleAvailable).toBe(false);
    expect(seen.title).toBe('');
    expect(seen.alive).toBe(true);
  });

  it('falls back to any browser window on the display when its own is absent', async () => {
    // Documents the current heuristic: Chromium does not always own its window
    // under the pid we spawned, so a browser-suffixed window is accepted even
    // from another pid. On a display with a second browser open, this reports
    // that other browser's title as the login window's.
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [{ pid: 999, title: 'Unrelated tab - Chromium' }];
    expect((await browser.observe()).title).toBe('Unrelated tab');
  });

  it('reports an empty title but available tooling when no window matches', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [{ pid: 999, title: 'some panel' }];
    expect(await browser.observe()).toEqual({ alive: true, title: '', titleAvailable: true });
  });

  it('reports not alive once the child has exited', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [{ pid: browser.pid ?? 0, title: 'Grok - Chromium' }];
    h.spawns[0].child.exit(0);
    expect(await browser.observe()).toEqual({ alive: false, title: '', titleAvailable: false });
  });

  it('reports the title as unavailable when there is no display to look at', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options({ env: {} }), h.deps);
    await browser.start();
    h.windows = [{ pid: browser.pid ?? 0, title: 'Grok - Chromium' }];
    expect(await browser.observe()).toEqual({ alive: true, title: '', titleAvailable: false });
  });
});

// ── ManualLoginBrowser: cleanup ──────────────────────────────────────────────

describe('ManualLoginBrowser.close', () => {
  it('asks politely first and does not escalate when the browser exits', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    await browser.close();
    expect(h.spawns[0].child.signals).toEqual(['SIGTERM']);
  });

  it('escalates to SIGKILL only when SIGTERM is ignored', async () => {
    const h = makeHarness();
    h.onSpawn = child => { child.diesOn = 'SIGKILL'; };
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    await browser.close();
    // Order matters: a stuck browser is still asked before it is killed.
    expect(h.spawns[0].child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(h.spawns[0].child.dead).toBe(true);
  });

  it('is a no-op on a browser that was never started', async () => {
    const h = makeHarness();
    await new ManualLoginBrowser(options(), h.deps).close();
    expect(h.spawns).toHaveLength(0);
    expect(h.sleeps).toHaveLength(0);
    expect(h.lockRemovals).toBe(0);
  });

  it('waits for the browser to release the profile lock', async () => {
    const profileDirPath = tempProfile();
    const lock = join(profileDirPath, 'SingletonLock');
    writeFileSync(lock, '');
    const h = makeHarness();
    // The real browser drops the lock a moment after it exits; 250ms is the
    // release poll, so this only fires once close() starts waiting on it.
    h.onSleep = ms => { if (ms === 250) rmSync(lock, { force: true }); };

    const browser = new ManualLoginBrowser(options({ profileDirPath }), h.deps);
    await browser.start();
    await browser.close();

    // Only the pre-launch clear ran: a lock released normally is not forced.
    expect(h.lockRemovals).toBe(1);
    expect(h.sleeps).toContain(250);
  });

  it('clears a lock the browser left behind, so the next open is not blocked', async () => {
    const profileDirPath = tempProfile();
    const lock = join(profileDirPath, 'SingletonLock');
    writeFileSync(lock, '');
    const h = makeHarness();
    const startClock = h.clock;

    const browser = new ManualLoginBrowser(options({ profileDirPath }), h.deps);
    await browser.start();
    await browser.close(10_000, 15_000);

    expect(existsSync(lock)).toBe(true); // the injected remover only records
    expect(h.lockRemovals).toBe(2);      // once before launch, once after the wait
    expect(h.clock - startClock).toBeGreaterThanOrEqual(15_000);
  });

  it('returns straight away when the profile lock is already gone', async () => {
    const profileDirPath = tempProfile();
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options({ profileDirPath }), h.deps);
    await browser.start();
    const sleepsBefore = h.sleeps.length;
    await browser.close();
    expect(h.sleeps.length).toBe(sleepsBefore);
    expect(h.lockRemovals).toBe(1);
  });

  it('reports not alive after closing', async () => {
    const h = makeHarness();
    const browser = new ManualLoginBrowser(options(), h.deps);
    await browser.start();
    h.windows = [{ pid: browser.pid ?? 0, title: 'Grok - Chromium' }];
    await browser.close();
    expect(await browser.observe()).toEqual({ alive: false, title: '', titleAvailable: false });
    expect(browser.pid).toBeUndefined();
  });
});
