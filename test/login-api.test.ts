// ── The HTTP + WebSocket login API in src/server.ts ──────────────────────────
//
// Conduit DETECTS a provider security check, explains it and hands control to
// the person; it never solves, clicks or suppresses one. Every assertion below
// is about detection, messaging and hand-off — never circumvention.
//
// Order matters once: the first describe pins the pristine "no attempt yet"
// status document, so it must run before any login is started.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, request } from 'node:http';
import type { BridgeConfig } from '../src/types.js';

// Redirect the home directory so MetricsStore never writes the real
// ~/.conduit/usage.json while the suite runs. Self-contained because vi.mock
// is hoisted above every const here.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-login-api-test-home'),
  };
});

// Shared, test-controllable behaviour for the fake registry and the display
// probe. vi.hoisted so the (hoisted) mock factories can reference it.
const h = vi.hoisted(() => {
  const freshDisplay = () => ({
    ok: true,
    reason: undefined as string | undefined,
    display: ':99' as string | null,
    wayland: false,
    xReachable: true,
    windowManager: true,
    windowToolsAvailable: true,
    headfulBinary: '/usr/lib/chromium/chrome',
    profileLock: null,
    warnings: [] as string[],
  });

  const state = {
    /** While true the fake driver parks inside observeLoginBrowser, which keeps
     *  an attempt "active" without waiting out the manager's 1s poll sleep. */
    hold: true,
    alive: true,
    verdict: { verdict: 'ok' } as { verdict: string; kind?: string; rayId?: string; signal?: string },
    authenticated: false,
    restored: true,
    openCalls: [] as string[],
    closeCalls: [] as string[],
    verifyCalls: [] as string[],
    legacyLogins: [] as string[],
    logouts: [] as string[],
    probeDeps: [] as Array<Record<string, unknown> | undefined>,
    viewerInputs: [] as unknown[],
    display: freshDisplay(),
  };
  return { state, freshDisplay };
});

// The probe shells out to xdpyinfo/xprop and resolves the Chromium binary, so
// it is replaced wholesale. viewerUrl stays real: the URL the person opens is
// part of what these routes promise.
vi.mock('../src/login/display.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/login/display.js')>();
  return {
    ...actual,
    probeDisplay: async (_profileDir?: string, deps?: Record<string, unknown>) => {
      h.state.probeDeps.push(deps);
      return h.state.display;
    },
  };
});

// Replace the real ProviderRegistry (which would construct Playwright/SDK
// providers) with a lightweight fake. No browser is ever launched.
vi.mock('../src/registry.js', () => {
  const model = { id: 'web-perplexity/sonar-pro', provider: 'perplexity', displayName: 'Sonar Pro', owned_by: 'perplexity' };
  const DRIVER_PROVIDERS = ['perplexity', 'claude', 'gemini', 'chatgpt'];

  const driverFor = (name: string) => ({
    name,
    loginUrl: `https://${name}.test/login`,
    async openLoginBrowser() {
      h.state.openCalls.push(name);
      return { viewerUrl: `/v1/login/${name}/viewer`, diagnostics: { browserMode: 'handoff', displayOk: true } };
    },
    async observeLoginBrowser() {
      // Bounded park: a test that forgets to release still cannot wedge the
      // manager's loop (and with it server.stop()).
      const until = Date.now() + 1500;
      while (h.state.hold && Date.now() < until) await new Promise(r => setTimeout(r, 5));
      return { alive: h.state.alive, verdict: h.state.verdict, titleAvailable: true };
    },
    async closeLoginBrowser() { h.state.closeCalls.push(name); },
    async verifySession() {
      h.state.verifyCalls.push(name);
      return { authenticated: h.state.authenticated, verdict: { verdict: 'ok' }, diagnostics: {} };
    },
  });

  const baseProvider = (name: string) => ({
    name,
    models: name === 'perplexity' ? [model] : [],
    async ensureConnected() { return true; },
    async chat() { return 'mocked completion'; },
    async *chatStream() { yield 'mocked'; },
    async login(onReady: (url: string) => void) {
      h.state.legacyLogins.push(name);
      onReady(`https://${name}.test/login`);
    },
    async logout() { h.state.logouts.push(name); },
    async checkSession() { return h.state.restored; },
    async restoreSession() { return h.state.restored; },
    async captureLoginFrame() { return Buffer.from('fake-jpeg'); },
    async dispatchLoginInput(input: unknown) { h.state.viewerInputs.push(input); return true; },
  });

  const providers = new Map<string, Record<string, unknown>>();
  for (const name of DRIVER_PROVIDERS) {
    const provider = { ...baseProvider(name), loginDriver: () => driverFor(name) };
    Object.defineProperty(provider, 'sessionInfo', {
      enumerable: true,
      get: () => ({ loggedIn: h.state.restored, lastVerified: null, status: h.state.restored ? 'active' : 'expired' }),
    });
    providers.set(name, provider);
  }
  // grok deliberately has no loginDriver: it exercises the legacy
  // fire-and-forget path. `hasProfile` is what that path keys its
  // graphical-session guard off.
  const grok = { ...baseProvider('grok'), hasProfile: true };
  Object.defineProperty(grok, 'sessionInfo', {
    enumerable: true,
    get: () => ({ loggedIn: h.state.restored, lastVerified: null, status: h.state.restored ? 'active' : 'expired' }),
  });
  providers.set('grok', grok);
  providers.set('claude-api', baseProvider('claude-api'));

  class FakeRegistry {
    constructor(public cfg: BridgeConfig) {}
    allModels() { return [model]; }
    providerForModel(id: string) { return id === model.id ? providers.get('perplexity') : undefined; }
    get(name: string) { return providers.get(name) ?? baseProvider(name); }
    async getStatus() {
      const web = [...DRIVER_PROVIDERS, 'grok'].map(name => ({
        name,
        connected: h.state.restored,
        hasProfile: true,
        sessionValid: h.state.restored,
        models: name === 'perplexity' ? [model.id] : [],
        loginType: 'browser' as const,
        session: { loggedIn: h.state.restored, lastVerified: null, status: h.state.restored ? 'active' : 'expired' },
      }));
      return {
        running: true,
        port: this.cfg.port,
        version: '9.9.9',
        uptime: 1,
        providers: [
          ...web,
          { name: 'claude-api', connected: false, hasProfile: false, sessionValid: false, models: [], loginType: 'api-key' as const, session: { loggedIn: false, lastVerified: null, status: 'not_applicable' } },
        ],
      };
    }
    async restoreSessions() { /* no-op */ }
    async keepaliveSessions() { /* no-op */ }
    // BridgeServer calls this from an uncleared setTimeout 3s after start().
    async refreshApiModels() { return {}; }
    get isRestoring() { return false; }
  }
  return { ProviderRegistry: FakeRegistry };
});

import { BridgeServer } from '../src/server.js';
import { LOGIN_STATES } from '../src/login/state.js';

// ── Harness ──────────────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const p = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(p));
    });
  });
}

let server: BridgeServer;
let base: string;
let port: number;

/** Every login-route body seen this run, for the credential sweep at the end. */
const loginBodies: Array<{ label: string; body: unknown }> = [];
/** Providers whose attempt still needs tearing down after a test. */
const started = new Set<string>();

interface Reply { status: number; body: any }

async function call(method: string, path: string): Promise<Reply> {
  const res = await fetch(base + path, { method });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (path.startsWith('/v1/login') || path.startsWith('/v1/logout')) {
    loginBodies.push({ label: `${method} ${path}`, body });
  }
  return { status: res.status, body };
}

/** Raw request, so odd targets reach the router exactly as written. */
function raw(path: string, method = 'GET'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let body: any = null;
        try { body = data ? JSON.parse(data) : null; } catch { body = data; }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function startLogin(name: string): Promise<Reply> {
  const reply = await call('POST', `/v1/login/${name}`);
  if (reply.status === 202) started.add(name);
  return reply;
}

/**
 * Cancels an attempt. The cancel handler awaits the manager's loop, which is
 * parked in the fake observer, so the park is released once the request is in
 * flight and re-armed afterwards.
 */
async function cancelLogin(name: string): Promise<Reply> {
  const pending = fetch(`${base}/v1/login/${name}/cancel`, { method: 'POST' });
  await new Promise(r => setTimeout(r, 15));
  const held = h.state.hold;
  h.state.hold = false;
  const res = await pending;
  h.state.hold = held;
  started.delete(name);
  const body = await res.json();
  loginBodies.push({ label: `POST /v1/login/${name}/cancel`, body });
  return { status: res.status, body };
}

async function waitFor<T>(probe: () => Promise<T | null | undefined | false>, what: string, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Polls the status route until the login snapshot reaches one of `states`. */
function waitForLoginState(name: string, states: string[]): Promise<any> {
  return waitFor(async () => {
    const { body } = await call('GET', `/v1/login/${name}/status`);
    return body?.login && states.includes(body.login.state) ? body : null;
  }, `${name} login to reach ${states.join('|')}`);
}

beforeAll(async () => {
  port = await getFreePort();
  const cfg: BridgeConfig = {
    port,
    host: '127.0.0.1',
    profileBaseDir: '/tmp/conduit-login-api-test-profiles',
    headless: true,
    logLevel: 'silent',
    apiKeys: {},
    login: {
      mode: 'assisted',
      timings: { pollIntervalMs: 20, hardTimeoutMs: 4_000, verifyingGraceMs: 10, challengeAnnounceMs: 20 },
    },
  };
  server = new BridgeServer(cfg);
  await server.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  h.state.hold = false;
  await server.stop();
});

beforeEach(() => {
  h.state.hold = true;
  h.state.alive = true;
  h.state.verdict = { verdict: 'ok' };
  h.state.authenticated = false;
  h.state.restored = true;
  h.state.openCalls = [];
  h.state.closeCalls = [];
  h.state.verifyCalls = [];
  h.state.legacyLogins = [];
  h.state.logouts = [];
  h.state.probeDeps = [];
  h.state.viewerInputs = [];
  h.state.display = h.freshDisplay();
});

afterEach(async () => {
  for (const name of [...started]) await cancelLogin(name);
});

// ── Status route ─────────────────────────────────────────────────────────────

describe('GET /v1/login/:provider/status', () => {
  it('returns the full status document for a browser provider before any attempt', async () => {
    // This route used to 404: the sub-route regex was anchored against a path
    // that never matched. Pin that it resolves now.
    const { status, body } = await call('GET', '/v1/login/perplexity/status');
    expect(status).toBe(200);
    expect(body.provider).toBe('perplexity');
    expect(body.active).toBe(false);
    expect(body.login).toBeNull();
    expect(body.viewer).toEqual({
      available: false,
      url: '/v1/login/perplexity/viewer',
    });
    expect(body.environment).toMatchObject({
      ready: true,
      graphicalSession: true,
      windowManager: true,
      liveStatus: true,
    });
    expect(body.environment.warnings).toEqual([]);
  });

  it('still matches when the request carries a query string', async () => {
    // The router used to compare the raw request target, so ?x=1 fell through
    // to the 404 branch.
    const { status, body } = await call('GET', '/v1/login/perplexity/status?x=1');
    expect(status).toBe(200);
    expect(body.provider).toBe('perplexity');
  });

  it('probes the display without a VNC dependency', async () => {
    await call('GET', '/v1/login/perplexity/status');
    expect(h.state.probeDeps.at(-1)).toBeUndefined();
  });

  it('reports an unusable graphical session instead of pretending it is ready', async () => {
    h.state.display = {
      ...h.freshDisplay(),
      ok: false,
      reason: 'The graphical session :99 is configured but is not responding.',
      xReachable: false,
      windowManager: false,
      windowToolsAvailable: false,
      warnings: ['The virtual desktop has no window manager.'],
    };
    const { status, body } = await call('GET', '/v1/login/perplexity/status');
    expect(status).toBe(200);
    expect(body.environment.ready).toBe(false);
    expect(body.environment.reason).toContain('not responding');
    expect(body.viewer).toEqual({ available: false, url: null });
  });

  it('rejects a provider that does not use browser login with 400', async () => {
    const { status, body } = await call('GET', '/v1/login/claude-api/status');
    expect(status).toBe(400);
    expect(body.status).toBe('error');
    expect(body.message).toContain('does not use browser login');
  });

  it('returns 404, not 500, for an unknown provider name', async () => {
    const unknown = await call('GET', '/v1/login/bogus/status');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.type).toBe('not_found');
  });

  it('rejects POST to /status with 405', async () => {
    const { status, body } = await call('POST', '/v1/login/perplexity/status');
    expect(status).toBe(405);
    expect(body.error.message).toContain('Use GET');
  });
});

// ── Starting, duplicate prevention, cancel ───────────────────────────────────

describe('POST /v1/login/:provider', () => {
  it('starts an attempt with 202, a human message and a login snapshot', async () => {
    const { status, body } = await startLogin('perplexity');
    expect(status).toBe(202);
    expect(body.status).toBe('login_started');
    // Both the CLI and the dashboard render this top-level field verbatim, so
    // pin the sentence rather than merely its type.
    expect(body.message).toBe('Interactive browser login starting. Watch Activity for progress.');
    expect(body.login).toMatchObject({ provider: 'perplexity', state: 'starting' });
    expect(body.login.sessionId).toMatch(/\S/);
    expect(body.login.loginUrl).toBe('https://perplexity.test/login');
    // The server builds its LoginSessionManager without cfg.login.mode, so the
    // snapshot reports the default handoff mode even though this config asks
    // for 'assisted'. Pinned as current behaviour (see the report).
        // The configured mode is reported back: BridgeServer now builds its
    // LoginSessionManager in the constructor, so cfg.login reaches it.
    expect(body.login.diagnostics.browserMode).toBe('assisted');
    expect(body.viewer.available).toBe(true);

    const live = await waitForLoginState('perplexity', ['browser_ready', 'waiting_for_user']);
    expect(live.active).toBe(true);
    expect(live.login.message).toContain('Perplexity');
  });

  it('refuses a second concurrent attempt with 409 and returns the live snapshot', async () => {
    const first = await startLogin('perplexity');
    await waitForLoginState('perplexity', ['browser_ready', 'waiting_for_user']);

    const second = await call('POST', '/v1/login/perplexity');
    expect(second.status).toBe(409);
    expect(second.body.status).toBe('already_running');
    expect(second.body.message).toContain('already in progress');
    // Same attempt, not a new one: a second visible browser cannot open the
    // same profile directory.
    expect(second.body.login.sessionId).toBe(first.body.login.sessionId);
    expect(h.state.openCalls.filter(n => n === 'perplexity')).toHaveLength(1);
  });

  it('cancels an attempt and then accepts a fresh one', async () => {
    h.state.restored = false;
    const first = await startLogin('perplexity');
    await waitForLoginState('perplexity', ['browser_ready', 'waiting_for_user']);

    const cancelled = await cancelLogin('perplexity');
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('ok');
    expect(cancelled.body.login.state).toBe('cancelled');
    expect(cancelled.body.login.message).toContain('cancelled');
    expect(h.state.closeCalls).toContain('perplexity');

    const after = await call('GET', '/v1/login/perplexity/status');
    expect(after.body.active).toBe(false);
    expect(after.body.login.state).toBe('cancelled');

    const again = await startLogin('perplexity');
    expect(again.status).toBe(202);
    expect(again.body.login.sessionId).not.toBe(first.body.login.sessionId);
  });

  it('does not let a cancelled attempt override a valid provider session', async () => {
    h.state.restored = true;
    await startLogin('perplexity');
    await waitForLoginState('perplexity', ['browser_ready', 'waiting_for_user']);

    const cancelled = await cancelLogin('perplexity');
    expect(cancelled.body.login.state).toBe('cancelled');

    const loginStatus = await call('GET', '/v1/login/perplexity/status');
    expect(loginStatus.body.active).toBe(false);
    expect(loginStatus.body.login).toBeNull();

    const bridgeStatus = await call('GET', '/v1/status');
    const provider = bridgeStatus.body.providers.find((entry: { name: string }) => entry.name === 'perplexity');
    expect(provider.sessionValid).toBe(true);
    expect(provider.login).toBeUndefined();
  });

  it('rejects GET on /cancel with 405', async () => {
    const { status, body } = await call('GET', '/v1/login/perplexity/cancel');
    expect(status).toBe(405);
    expect(body.error.message).toContain('Use POST');
  });
});

describe('built-in login viewer on port 31338', () => {
  it('serves the provider-scoped viewer without VNC assets', async () => {
    const response = await fetch(base + '/v1/login/perplexity/viewer');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('/frame');
    expect(html).toContain('/input');
    expect(html).not.toMatch(/noVNC|websockify|RFB/i);
  });

  it('returns the current browser frame', async () => {
    const response = await fetch(base + '/v1/login/perplexity/frame');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('fake-jpeg');
  });

  it('accepts only validated input events', async () => {
    const accepted = await fetch(base + '/v1/login/perplexity/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'key', action: 'down', key: 'Enter' }),
    });
    expect(accepted.status).toBe(204);
    expect(h.state.viewerInputs).toEqual([{ type: 'key', action: 'down', key: 'Enter' }]);

    const click = await fetch(base + '/v1/login/perplexity/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pointer', action: 'click', x: 120, y: 240, button: 'left' }),
    });
    expect(click.status).toBe(204);
    expect(h.state.viewerInputs.at(-1)).toEqual({ type: 'pointer', action: 'click', x: 120, y: 240, button: 'left' });

    const rejected = await fetch(base + '/v1/login/perplexity/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'raw-cdp', method: 'Runtime.evaluate' }),
    });
    expect(rejected.status).toBe(400);
  });
});

// ── Recheck ──────────────────────────────────────────────────────────────────

describe('POST /v1/login/:provider/recheck', () => {
  it('asks a live attempt to verify now (202)', async () => {
    await startLogin('perplexity');
    await waitForLoginState('perplexity', ['browser_ready', 'waiting_for_user']);

    const { status, body } = await call('POST', '/v1/login/perplexity/recheck');
    expect(status).toBe(202);
    expect(body.status).toBe('checking');
    expect(body.provider).toBe('perplexity');
    expect(body.login.provider).toBe('perplexity');
    // The person asked for a check, so the reply has to say a check is running.
    expect(body.message).toBe('Checking the sign-in now.');
  });

  it('falls back to restoreSession when nothing is running (authenticated)', async () => {
    h.state.restored = true;
    const { status, body } = await call('POST', '/v1/login/gemini/recheck');
    expect(status).toBe(200);
    expect(body.status).toBe('authenticated');
    expect(body.message).toContain('signed in');
    expect(body.login).toBeNull();
    expect(body.session).toMatchObject({ status: 'active' });
  });

  it('falls back to restoreSession when nothing is running (not authenticated)', async () => {
    h.state.restored = false;
    const { status, body } = await call('POST', '/v1/login/chatgpt/recheck');
    expect(status).toBe(200);
    expect(body.status).toBe('not_authenticated');
    expect(body.message).toContain('not signed in');
  });

  it('rejects GET on /recheck with 405', async () => {
    const { status } = await call('GET', '/v1/login/perplexity/recheck');
    expect(status).toBe(405);
  });
});

// ── No graphical session ─────────────────────────────────────────────────────

describe('missing graphical session', () => {
  it('refuses to start a driver-backed login with 503 and says why', async () => {
    h.state.display = {
      ...h.freshDisplay(),
      ok: false,
      display: null,
      reason: 'No graphical session is available on the machine running Conduit Bridge.',
      warnings: ['The secure browser viewer is not running.'],
    };
    const { status, body } = await call('POST', '/v1/login/perplexity');
    expect(status).toBe(503);
    expect(body.type).toBe('interactive_session_required');
    expect(body.message).toContain('No graphical session');
    expect(body.environment.warnings).toEqual(['The secure browser viewer is not running.']);
    // Nothing was launched, so nothing needs cleaning up.
    expect(h.state.openCalls).toEqual([]);
  });

  it('refuses the legacy (driver-less) path when DISPLAY and WAYLAND_DISPLAY are unset', async () => {
    const display = process.env.DISPLAY;
    const wayland = process.env.WAYLAND_DISPLAY;
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    try {
      const { status, body } = await call('POST', '/v1/login/grok');
      expect(status).toBe(503);
      expect(body.type).toBe('interactive_session_required');
      expect(body.message).toContain('graphical session');
      expect(h.state.legacyLogins).toEqual([]);
    } finally {
      if (display === undefined) delete process.env.DISPLAY; else process.env.DISPLAY = display;
      if (wayland === undefined) delete process.env.WAYLAND_DISPLAY; else process.env.WAYLAND_DISPLAY = wayland;
    }
  });

  it('keeps the legacy fire-and-forget path for a provider without loginDriver', async () => {
    const display = process.env.DISPLAY;
    process.env.DISPLAY = ':99';
    try {
      const { status, body } = await call('POST', '/v1/login/grok');
      expect(status).toBe(202);
      expect(body.status).toBe('login_started');
      expect(body.message).toBe('Interactive browser login starting. Watch Activity for progress.');
      // The legacy reply has no snapshot — the session manager is not involved.
      expect(body.login).toBeUndefined();
      await waitFor(async () => h.state.legacyLogins.includes('grok'), 'the legacy login call');
      const after = await call('GET', '/v1/login/grok/status');
      expect(after.body.active).toBe(false);
      expect(after.body.login).toBeNull();
    } finally {
      if (display === undefined) delete process.env.DISPLAY; else process.env.DISPLAY = display;
    }
  });
});

// ── Provider blocked ─────────────────────────────────────────────────────────

describe('provider blocked', () => {
  it('reports the block, explains it and does not retry around it', async () => {
    h.state.restored = false;
    h.state.hold = false;
    h.state.verdict = { verdict: 'blocked', kind: 'cloudflare_block', rayId: '8fa1c0d2e3b4', signal: 'error 1015' };

    const started202 = await startLogin('claude');
    expect(started202.status).toBe(202);

    const blocked = await waitForLoginState('claude', ['blocked']);
    expect(blocked.active).toBe(false);
    expect(blocked.login.message).toBe('Login is blocked by Claude on this network.');
    // The wording must not promise that hammering the provider will work.
    expect(blocked.login.nextAction).toContain('Do not retry immediately');
    expect(blocked.login.diagnostics).toMatchObject({
      challengeKind: 'cloudflare_block',
      rayId: '8fa1c0d2e3b4',
      reason: 'error 1015',
    });
    // Detected and handed back: the browser was opened once and closed, never
    // reopened in a loop to work around the block.
    expect(h.state.openCalls.filter(n => n === 'claude')).toHaveLength(1);
    expect(h.state.closeCalls).toContain('claude');
    started.delete('claude');
  });
});

// ── Preserved behaviour and malformed requests ───────────────────────────────

describe('preserved routes and malformed requests', () => {
  it('still answers POST /v1/login/claude-api with 400 and API-key guidance', async () => {
    const { status, body } = await call('POST', '/v1/login/claude-api');
    expect(status).toBe(400);
    expect(body.status).toBe('error');
    expect(body.message).toContain('API credential');
    expect(body.message).toContain('write-only Settings');
    expect(body.message).not.toContain('conduit-bridge config apiKeys');
  });

  it('still answers POST /v1/logout/:provider with 200', async () => {
    const { status, body } = await call('POST', '/v1/logout/perplexity');
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', provider: 'perplexity' });
    expect(h.state.logouts).toContain('perplexity');
  });

  it('404s an unknown provider on the start route', async () => {
    const { status, body } = await call('POST', '/v1/login/bogus');
    expect(status).toBe(404);
    expect(body.error.type).toBe('not_found');
  });

  it('404s an unknown login sub-action', async () => {
    const { status, body } = await call('POST', '/v1/login/perplexity/solve');
    expect(status).toBe(404);
    expect(body.error.type).toBe('not_found');
  });

  it('does not match a login route for a traversal-shaped path', async () => {
    const encoded = await raw('/v1/login/..%2fadmin');
    expect(encoded.status).toBe(404);
    expect(encoded.body.error.type).toBe('not_found');
    const suffixed = await raw('/v1/login/perplexity/../status');
    expect(suffixed.status).toBe(404);
  });

  it('404s a login path with a trailing slash rather than treating it as a provider', async () => {
    const { status, body } = await raw('/v1/login/perplexity/');
    expect(status).toBe(404);
    expect(body.error.type).toBe('not_found');
  });
});

// ── WebSocket events ─────────────────────────────────────────────────────────

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

interface Frame { opcode: number; fin: boolean; masked: boolean; payload: string }

/** Decodes as many whole server frames as `buf` holds; returns the remainder. */
function decodeFrames(buf: Buffer, out: Frame[]): Buffer {
  let offset = 0;
  for (;;) {
    if (buf.length - offset < 2) break;
    const first = buf[offset];
    const second = buf[offset + 1];
    let length = second & 0x7f;
    let header = 2;
    if (length === 126) {
      if (buf.length - offset < 4) break;
      length = buf.readUInt16BE(offset + 2);
      header = 4;
    } else if (length === 127) {
      if (buf.length - offset < 10) break;
      length = Number(buf.readBigUInt64BE(offset + 2));
      header = 10;
    }
    if (buf.length - offset < header + length) break;
    out.push({
      opcode: first & 0x0f,
      fin: (first & 0x80) !== 0,
      masked: (second & 0x80) !== 0,
      payload: buf.subarray(offset + header, offset + header + length).toString('utf8'),
    });
    offset += header + length;
  }
  return buf.subarray(offset);
}

interface EventSocket { frames: Frame[]; accept: string; expectedAccept: string; close(): void }

/** Hand-rolled upgrade: there is no ws dependency in this repo. */
function openEventSocket(origin?: string): Promise<EventSocket> {
  const key = randomBytes(16).toString('base64');
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port,
      path: '/v1/events',
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        ...(origin ? { Origin: origin } : {}),
      },
    });
    req.on('upgrade', (res, socket, head) => {
      const frames: Frame[] = [];
      let pending = decodeFrames(head?.length ? Buffer.from(head) : Buffer.alloc(0), frames);
      socket.on('data', chunk => { pending = decodeFrames(Buffer.concat([pending, chunk]), frames); });
      socket.on('error', () => { /* the test tears the socket down itself */ });
      resolve({
        frames,
        accept: String(res.headers['sec-websocket-accept'] ?? ''),
        expectedAccept: createHash('sha1').update(key + WS_GUID).digest('base64'),
        close: () => socket.destroy(),
      });
    });
    req.on('response', res => reject(new Error(`upgrade refused with ${res.statusCode}`)));
    req.on('error', reject);
    req.end();
  });
}

describe('WebSocket /v1/events', () => {
  let ws: EventSocket | null = null;

  it('refuses an upgrade from a foreign page', async () => {
    // A WebSocket upgrade is exempt from the same-origin policy AND from CORS,
    // so without this check any page could subscribe to the event stream and
    // read login diagnostics and activity.
    await expect(openEventSocket('https://evil.example')).rejects.toThrow();
  });

  it('accepts the dashboard\'s own origin and a client that sends none', async () => {
    const fromDashboard = await openEventSocket(base);
    expect(fromDashboard.accept).toBe(fromDashboard.expectedAccept);
    fromDashboard.close();
    const fromCli = await openEventSocket();
    expect(fromCli.accept).toBe(fromCli.expectedAccept);
    fromCli.close();
  });

  afterEach(() => {
    ws?.close();
    ws = null;
  });

  it('pushes login snapshots and leaves the activity envelope unchanged', async () => {
    ws = await openEventSocket();
    expect(ws.accept).toBe(ws.expectedAccept);

    await startLogin('perplexity');

    const socket = ws;
    const loginFrame = await waitFor(
      async () => socket.frames.find(f => f.payload.includes('"type":"login"')),
      'a login frame',
    );
    // Server-to-client frames are unmasked single text frames.
    expect(loginFrame.opcode).toBe(0x1);
    expect(loginFrame.fin).toBe(true);
    expect(loginFrame.masked).toBe(false);

    const login = JSON.parse(loginFrame.payload);
    expect(login.type).toBe('login');
    expect(login.login.provider).toBe('perplexity');
    // The dashboard switches on this value, so it must be a real member of the
    // union rather than any string the server happens to send.
    expect(LOGIN_STATES).toContain(login.login.state);
    expect(login.login.message).toContain('Perplexity');

    // The dashboard branches on data.type, so the activity envelope must not
    // have drifted now that login events share the socket.
    const activityFrame = await waitFor(
      async () => socket.frames.find(f => f.payload.includes('"type":"activity"')),
      'an activity frame',
    );
    const activity = JSON.parse(activityFrame.payload);
    expect(activity.type).toBe('activity');
    expect(activity.event).toMatchObject({ scope: 'perplexity' });
    expect(typeof activity.event.id).toBe('number');
    expect(typeof activity.event.time).toBe('number');
    expect(typeof activity.event.level).toBe('string');
    expect(typeof activity.event.message).toBe('string');

    // A snapshot long enough to use the 126 extended-length header still
    // decodes, which is the framing the login copy actually produces.
    expect(socket.frames.some(f => f.payload.length >= 126)).toBe(true);

    for (const frame of socket.frames) {
      expect(scanForSecrets(JSON.parse(frame.payload), 'frame')).toEqual([]);
    }
  });
});

// ── Nothing credential-shaped may leave through these routes ─────────────────

const SENSITIVE_KEY = /cookie|token|secret|password|credential/i;
// Credential-shaped values: a known key prefix, or a long unbroken run of
// credential characters. The UUID sessionId (36 chars) stays under the bar.
const SENSITIVE_VALUE = /(?:sk-|pplx-|eyJ)[A-Za-z0-9_.-]{8,}|[A-Za-z0-9_-]{40,}/;

function scanForSecrets(value: unknown, path = 'body', found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value)) found.push(`${path} holds a credential-shaped value`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanForSecrets(item, `${path}[${i}]`, found));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) found.push(`${path}.${key} is a credential-shaped key`);
      scanForSecrets(child, `${path}.${key}`, found);
    }
  }
  return found;
}

describe('cross-site protection', () => {
  // The bridge listens on loopback with no auth token by default, so any page
  // in the person's browser can reach it. A cross-origin POST with a text/plain
  // body is a "simple request": no preflight, and CORS only hides the RESPONSE.
  // That is no comfort when the side effect is storing an API key or opening a
  // browser, so state-changing requests are gated on provenance.
  it('rejects a state-changing request that a foreign page made', async () => {
    for (const path of ['/v1/login/perplexity', '/v1/login/perplexity/cancel', '/v1/settings/api-key']) {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
        body: '{"provider":"claude-api","key":"placeholder-value"}',
      });
      expect(res.status, path).toBe(403);
      const body = await res.json() as any;
      expect(body.error.type, path).toBe('forbidden');
    }
  });

  it('accepts the dashboard\'s own same-origin request', async () => {
    const res = await fetch(base + '/v1/login/claude-api', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', Origin: base },
    });
    // 400 is this provider's normal "use an API key" answer, not a rejection.
    expect(res.status).toBe(400);
  });

  it('leaves non-browser clients alone', async () => {
    // curl and SDKs send neither header, and a web page cannot suppress them.
    const res = await fetch(base + '/v1/login/claude-api', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('does not gate reads', async () => {
    const res = await fetch(base + '/v1/status', { headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(200);
  });
});


describe('login responses carry no credentials', () => {
  it('exposes no cookie, token, secret or password anywhere in the login surface', async () => {
    const sweep: Array<{ label: string; body: unknown }> = [];
    sweep.push({ label: 'status', body: (await call('GET', '/v1/login/perplexity/status')).body });
    sweep.push({ label: 'start', body: (await startLogin('perplexity')).body });
    sweep.push({ label: 'duplicate', body: (await call('POST', '/v1/login/perplexity')).body });
    sweep.push({ label: 'recheck', body: (await call('POST', '/v1/login/perplexity/recheck')).body });
    sweep.push({ label: 'cancel', body: (await cancelLogin('perplexity')).body });
    sweep.push({ label: 'api-key provider', body: (await call('POST', '/v1/login/claude-api')).body });
    sweep.push({ label: 'logout', body: (await call('POST', '/v1/logout/perplexity')).body });

    for (const entry of [...sweep, ...loginBodies]) {
      expect({ label: entry.label, leaks: scanForSecrets(entry.body) })
        .toEqual({ label: entry.label, leaks: [] });
    }
  });
});
