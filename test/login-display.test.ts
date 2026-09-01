import { describe, expect, it } from 'vitest';
import { probeDisplay, type ProbeDeps } from '../src/login/display.js';

const THIS_HOST = 'conduit-test-host';
const DISPLAY = ':99';
const HEADFUL_BINARY = '/opt/conduit/chromium/chrome';
const PROFILE_DIR = '/var/lib/conduit/profiles/grok';

type RunResult = { ok: boolean; stdout: string };
const X_OK: RunResult = { ok: true, stdout: 'screen #0:\n dimensions: 1280x800 pixels' };
const X_DOWN: RunResult = { ok: false, stdout: '' };
const WM_OK: RunResult = { ok: true, stdout: '_NET_SUPPORTING_WM_CHECK(WINDOW): window id # 0x400003' };
const WM_NONE: RunResult = { ok: true, stdout: '_NET_SUPPORTING_WM_CHECK: not found.' };

function makeRun(x = X_OK, wm = WM_OK) {
  const calls: Array<{ file: string; args: string[]; display?: string }> = [];
  const run: NonNullable<ProbeDeps['run']> = async (file, args, env) => {
    calls.push({ file, args, display: env.DISPLAY });
    return file === 'xdpyinfo' ? x : wm;
  };
  return { run, calls };
}

function deps(over: ProbeDeps = {}): ProbeDeps {
  return {
    env: { DISPLAY },
    run: makeRun().run,
    hostname: () => THIS_HOST,
    resolveHeadfulBinary: () => HEADFUL_BINARY,
    readProfileLock: () => null,
    processAlive: () => false,
    ...over,
  };
}

describe('probeDisplay', () => {
  it('reports a missing graphical session with remote-server guidance', async () => {
    const runner = makeRun();
    const probe = await probeDisplay(undefined, deps({ env: {}, run: runner.run }));
    expect(probe.ok).toBe(false);
    expect(probe.reason).toMatch(/graphical session/i);
    expect(probe.reason).toMatch(/Xvfb/i);
    expect(runner.calls).toHaveLength(0);
  });

  it('rejects an unreachable X display', async () => {
    const probe = await probeDisplay(undefined, deps({ run: makeRun(X_DOWN).run }));
    expect(probe.ok).toBe(false);
    expect(probe.reason).toContain(DISPLAY);
    expect(probe.xReachable).toBe(false);
  });

  it('accepts a responsive X display and Chromium', async () => {
    const runner = makeRun();
    const probe = await probeDisplay(undefined, deps({ run: runner.run }));
    expect(probe.ok).toBe(true);
    expect(probe.headfulBinary).toBe(HEADFUL_BINARY);
    expect(runner.calls[0]).toMatchObject({ file: 'xdpyinfo', args: ['-display', DISPLAY], display: DISPLAY });
  });

  it('requires actual screen output from xdpyinfo', async () => {
    const probe = await probeDisplay(undefined, deps({ run: makeRun({ ok: true, stdout: 'unable to open display' }).run }));
    expect(probe.ok).toBe(false);
  });

  it('reports how to install Chromium', async () => {
    const probe = await probeDisplay(undefined, deps({ resolveHeadfulBinary: () => null }));
    expect(probe.ok).toBe(false);
    expect(probe.reason).toContain('playwright install chromium');
  });

  it('accepts Wayland without probing X', async () => {
    const runner = makeRun();
    const probe = await probeDisplay(undefined, deps({ env: { WAYLAND_DISPLAY: 'wayland-0' }, run: runner.run }));
    expect(probe.ok).toBe(true);
    expect(probe.wayland).toBe(true);
    expect(runner.calls).toHaveLength(0);
  });

  it('treats a missing window manager as an advisory only', async () => {
    const probe = await probeDisplay(undefined, deps({ run: makeRun(X_OK, WM_NONE).run }));
    expect(probe.ok).toBe(true);
    expect(probe.windowManager).toBe(false);
    expect(probe.warnings.some(w => /pop-up/i.test(w))).toBe(true);
    expect(probe.warnings.some(w => /VNC/i.test(w))).toBe(false);
  });

  it('does not expose a VNC health field', async () => {
    const probe = await probeDisplay(undefined, deps());
    expect('vnc' in probe).toBe(false);
  });
});

describe('profile locks', () => {
  it('does not read a lock without a profile', async () => {
    let reads = 0;
    const probe = await probeDisplay(undefined, deps({ readProfileLock: () => { reads += 1; return null; } }));
    expect(probe.profileLock).toBeNull();
    expect(reads).toBe(0);
  });

  it('reports an absent profile lock', async () => {
    const probe = await probeDisplay(PROFILE_DIR, deps());
    expect(probe.profileLock).toEqual({ present: false, hostnameMatches: true, stale: false });
  });

  it('marks a dead local lock as stale', async () => {
    const probe = await probeDisplay(PROFILE_DIR, deps({
      readProfileLock: () => ({ host: THIS_HOST, pid: 42 }),
      processAlive: () => false,
    }));
    expect(probe.profileLock).toEqual({ present: true, hostnameMatches: true, stale: true });
  });

  it('keeps a live local lock', async () => {
    const probe = await probeDisplay(PROFILE_DIR, deps({
      readProfileLock: () => ({ host: THIS_HOST, pid: 42 }),
      processAlive: () => true,
    }));
    expect(probe.profileLock).toEqual({ present: true, hostnameMatches: true, stale: false });
  });

  it('marks a foreign lock as stale and warns', async () => {
    const probe = await probeDisplay(PROFILE_DIR, deps({
      readProfileLock: () => ({ host: 'other-host', pid: 42 }),
      processAlive: () => true,
    }));
    expect(probe.profileLock).toEqual({ present: true, hostnameMatches: false, stale: true });
    expect(probe.warnings.some(w => /another machine/i.test(w))).toBe(true);
  });

  it('returns diagnostics when an injected dependency throws', async () => {
    const boom = () => { throw new Error('probe failed'); };
    const probe = await probeDisplay(PROFILE_DIR, {
      env: {},
      resolveHeadfulBinary: boom as ProbeDeps['resolveHeadfulBinary'],
    });
    expect(probe.ok).toBe(false);
    expect(probe.reason).toContain('probe failed');
  });
});
