import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BridgeConfig, ProviderName } from '../src/types.js';

// Keep MetricsStore/RunHistory out of the real ~/.conduit while the suite runs,
// exactly as test/server.test.ts does (vi.mock is hoisted above every const).
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-login-integration-home'),
  };
});

// The login routes refuse to start when no graphical session is available, and
// a test machine has none. Only the probe is faked; viewerUrl and every other
// export stay real, so the route still computes the viewer answer itself.
vi.mock('../src/login/display.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/login/display.js')>();
  return {
    ...actual,
    probeDisplay: async () => ({
      ok: true,
      display: ':99',
      wayland: false,
      xReachable: true,
      windowManager: true,
      windowToolsAvailable: true,
      headfulBinary: '/nonexistent/chromium-placeholder',
      profileLock: null,
      warnings: [],
    }),
  };
});

// Shared, test-controllable driver slot. vi.hoisted so the registry factory
// (hoisted above the imports) can reach it.
const h = vi.hoisted(() => ({ driver: null as unknown }));

// The real ProviderRegistry would construct Playwright providers. This fake
// only has to hand the server a login driver and a status document.
vi.mock('../src/registry.js', () => {
  const grokModel = { id: 'web-grok/grok-fast', provider: 'grok', displayName: 'Grok Fast', owned_by: 'xai' };
  const provider = {
    name: 'grok',
    models: [grokModel],
    async ensureConnected() { return false; },
    async chat() { return 'unused'; },
    async *chatStream() { yield 'unused'; },
    async login() { /* superseded by loginDriver() */ },
    async logout() { /* no-op */ },
    async checkSession() { return false; },
    async restoreSession() { return false; },
    loginDriver() { return h.driver; },
  };

  class FakeRegistry {
    constructor(public cfg: BridgeConfig) {}
    allModels() { return [grokModel]; }
    providerForModel(model: string) { return model === grokModel.id ? provider : undefined; }
    get() { return provider; }
    async getStatus() {
      return {
        running: true,
        port: this.cfg.port,
        version: '9.9.9',
        providers: [{
          name: 'grok', connected: false, hasProfile: true, sessionValid: false,
          loginType: 'browser', models: [grokModel.id],
        }],
        uptime: 1,
      };
    }
    async restoreSessions() { /* no-op */ }
    async keepaliveSessions() { /* no-op */ }
    async refreshApiModels() { return {}; }
    get isRestoring() { return false; }
  }
  return { ProviderRegistry: FakeRegistry };
});

import { BridgeServer } from '../src/server.js';
import { classifyDom, classifyResponse, mergeVerdicts, type DomMarkers } from '../src/login/challenge.js';
import { authSignalsFor, decideAuthenticated } from '../src/login/auth-signals.js';
import type { LoginDriver } from '../src/login/session-manager.js';
import type { LoginSnapshot, LoginState } from '../src/login/state.js';

const PROVIDER: ProviderName = 'grok';

/** Stand-in cookie value; a placeholder that must never leave the mock site. */
const SITE_COOKIE_VALUE = 'do-not-leak-1';

// ── Mock provider site ───────────────────────────────────────────────────────

type SiteMode = 'challenge' | 'blocked' | 'signed_out' | 'signed_in';

/** A Cloudflare-style interstitial: the person must complete it, not Conduit. */
const CHALLENGE_HTML = `<html><head><title>Just a moment...</title></head><body>
<h1>Checking if the site connection is secure</h1>
<p>Performing security verification before you continue.</p>
<form id="challenge-form" action="/cdn-cgi/challenge-platform/verify" method="POST">
<input type="hidden" name="cf-turnstile-response" value="">
</form></body></html>`;

const BLOCKED_HTML = `<html><head><title>Attention Required!</title></head><body>
<h1>Sorry, you have been blocked</h1>
<p>You are unable to access this site.</p>
<p>Ray ID: def456 &bull; error code: 1020</p>
</body></html>`;

const SIGNED_OUT_HTML = `<html><head><title>Mock Provider</title></head><body>
<header><button data-testid="login-button">Log in</button></header>
<main><p>Sign in to start a conversation.</p></main></body></html>`;

const SIGNED_IN_HTML = `<html><head><title>Mock Provider</title></head><body>
<nav>New chat</nav><main><textarea id="prompt-textarea"></textarea></main></body></html>`;

let siteMode: SiteMode = 'signed_out';
let site: Server;
let siteBase: string;
/** Every request the mock provider received, so "we never touched it" is checkable. */
const siteRequests: Array<{ method: string; path: string }> = [];

function serveSite(req: IncomingMessage, res: ServerResponse): void {
  siteRequests.push({ method: req.method ?? '', path: (req.url ?? '').split('?')[0] });
  switch (siteMode) {
    case 'challenge':
      res.writeHead(403, {
        'content-type': 'text/html; charset=utf-8',
        'cf-mitigated': 'challenge',
        'cf-ray': 'abc123-FRA',
        server: 'cloudflare',
        'set-cookie': `__cf_bm=${SITE_COOKIE_VALUE}; Path=/; HttpOnly`,
      });
      res.end(CHALLENGE_HTML);
      return;
    case 'blocked':
      res.writeHead(403, {
        'content-type': 'text/html; charset=utf-8',
        'cf-ray': 'def456-FRA',
        server: 'cloudflare',
      });
      res.end(BLOCKED_HTML);
      return;
    case 'signed_in':
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': `sso=${SITE_COOKIE_VALUE}; Path=/; HttpOnly`,
      });
      res.end(SIGNED_IN_HTML);
      return;
    default:
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(SIGNED_OUT_HTML);
  }
}

// ── A login driver whose observations come from the mock site ────────────────

/**
 * Build the same marker set `evaluateChallengeMarkers` collects from a live
 * page, but from the bytes the mock site actually served, so the real
 * classifiers run over realistic input.
 */
function domMarkersFrom(url: string, html: string): DomMarkers {
  return {
    title: /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '',
    host: new URL(url).hostname,
    hasChallengeRuntime: html.includes('_cf_chl_opt'),
    hasChallengeResponseInput: html.includes('name="cf-turnstile-response"'),
    // A hidden field is not a visible widget: only the person can see one, and
    // only the person may complete it.
    visibleChallengeWidget: false,
    bodyTextSample: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
  };
}

interface DriverProbe {
  opened: number;
  closed: number;
  /** Every property the session manager touched on the driver. */
  calls: string[];
}

function makeLoginDriver(probe: DriverProbe): LoginDriver {
  const pageUrl = `${siteBase}/`;

  const look = async () => {
    const res = await fetch(pageUrl, { redirect: 'manual' });
    const html = await res.text();
    const headers = Object.fromEntries(res.headers) as Record<string, string>;
    // Network verdict first: `cf-mitigated` is the vendor-documented signal and
    // outranks whatever the rendered body happens to say.
    const verdict = mergeVerdicts(
      classifyResponse(res.status, headers),
      classifyDom(domMarkersFrom(pageUrl, html)),
    );
    return { res, html, verdict };
  };

  const driver: LoginDriver = {
    name: PROVIDER,
    loginUrl: `${siteBase}/login`,
    async openLoginBrowser() {
      probe.opened++;
      return { viewerUrl: null, diagnostics: { browserMode: 'handoff', displayOk: true } };
    },
    async observeLoginBrowser() {
      const { verdict } = await look();
      return { alive: true, verdict, titleAvailable: true };
    },
    async closeLoginBrowser() {
      probe.closed++;
    },
    async verifySession() {
      const { res, html, verdict } = await look();
      const signals = authSignalsFor(PROVIDER);
      // Cookie NAMES only — a value is never read, compared or carried anywhere.
      const cookieNames = res.headers.getSetCookie().map(c => c.split('=')[0].trim());
      const decision = decideAuthenticated(signals, {
        host: new URL(pageUrl).hostname,
        path: new URL(pageUrl).pathname,
        hasSessionCookie: signals.sessionCookieNames.some(n => cookieNames.includes(n)),
        verifySelectorVisible: html.includes('id="prompt-textarea"'),
        authedSelectorVisible: false,
        loggedOutSelectorVisible: html.includes('>Log in<'),
      });
      return {
        authenticated: decision.authenticated,
        verdict,
        diagnostics: {
          finalUrl: pageUrl,
          pageTitle: domMarkersFrom(pageUrl, html).title,
          httpStatus: res.status,
          reason: decision.reason,
        },
      };
    },
  };

  // Record every property the manager reaches for, so an attempt to click,
  // solve or submit a challenge would be impossible to miss.
  return new Proxy(driver, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') probe.calls.push(prop);
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Anything that would mean Conduit worked the challenge instead of the person. */
const INTERACTION = /click|solve|submit|press|fill|type|check|bypass|turnstile|captcha/i;

// ── Bridge server + event socket ─────────────────────────────────────────────

let server: BridgeServer;
let base: string;
let socket: WebSocket;

/** Every JSON body the bridge returned, for the "nothing leaked" assertions. */
const bridgeBodies: string[] = [];
const bridgeSetCookies: Array<string | null> = [];
/** Every raw WebSocket frame text the dashboard would have received. */
const wireFrames: string[] = [];

const events: Array<{ type: string; login?: LoginSnapshot }> = [];
type Waiter = { pred: (s: LoginSnapshot) => boolean; resolve: (s: LoginSnapshot) => void };
const waiters = new Set<Waiter>();
/** Index into `events` where the current test's frames begin. */
let mark = 0;

async function bridge(path: string, init?: RequestInit): Promise<{ status: number; text: string; body: any }> {
  const res = await fetch(base + path, init);
  const text = await res.text();
  bridgeBodies.push(text);
  bridgeSetCookies.push(res.headers.get('set-cookie'));
  return { status: res.status, text, body: text ? JSON.parse(text) : null };
}

function loginStates(): LoginState[] {
  const seen = events.slice(mark).filter(e => e.type === 'login').map(e => e.login!.state);
  return seen.filter((state, i) => state !== seen[i - 1]);
}

function waitForLogin(pred: (s: LoginSnapshot) => boolean, label: string, timeoutMs = 4000): Promise<LoginSnapshot> {
  const already = events.slice(mark).filter(e => e.type === 'login').map(e => e.login!).find(pred);
  if (already) return Promise.resolve(already);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(waiter);
      reject(new Error(`timed out waiting for ${label}; saw ${loginStates().join(' -> ') || '(nothing)'}`));
    }, timeoutMs);
    const waiter: Waiter = { pred, resolve: (s) => { clearTimeout(timer); resolve(s); } };
    waiters.add(waiter);
  });
}

const waitForState = (state: LoginState, timeoutMs?: number) =>
  waitForLogin(s => s.state === state, state, timeoutMs);

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as AddressInfo;
      srv.close(() => resolve(addr.port));
    });
  });
}

beforeAll(async () => {
  site = createServer(serveSite);
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  siteBase = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

  const port = await getFreePort();
  const cfg: BridgeConfig = {
    port,
    host: '127.0.0.1',
    profileBaseDir: '/tmp/conduit-login-integration-profiles',
    headless: true,
    logLevel: 'silent',
    apiKeys: {},
  };
  server = new BridgeServer(cfg);
  await server.start();
  base = `http://127.0.0.1:${port}`;

  socket = new WebSocket(`ws://127.0.0.1:${port}/v1/events`);
  socket.addEventListener('message', ev => {
    const text = String(ev.data);
    wireFrames.push(text);
    const payload = JSON.parse(text) as { type: string; login?: LoginSnapshot };
    events.push(payload);
    if (payload.type !== 'login' || !payload.login) return;
    for (const waiter of [...waiters]) {
      if (waiter.pred(payload.login)) { waiters.delete(waiter); waiter.resolve(payload.login); }
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('event socket refused')));
  });
});

afterAll(async () => {
  await server.stop();
  await new Promise<void>(resolve => site.close(() => resolve()));
});

beforeEach(() => {
  mark = events.length;
  siteRequests.length = 0;
  siteMode = 'signed_out';
});

afterEach(async () => {
  // Leave no attempt running; a no-op when the flow already reached a terminal state.
  await bridge(`/v1/login/${PROVIDER}/cancel`, { method: 'POST' });
});

describe('browser login, end to end against a local mock provider', () => {
  it('walks starting -> browser_ready -> waiting_for_user -> verifying -> authenticated', async () => {
    const probe: DriverProbe = { opened: 0, closed: 0, calls: [] };
    h.driver = makeLoginDriver(probe);

    const started = await bridge(`/v1/login/${PROVIDER}`, { method: 'POST' });
    expect(started.status).toBe(202);
    expect(started.body.status).toBe('login_started');
    expect(started.body.login.state).toBe('starting');

    await waitForState('browser_ready');
    await waitForState('waiting_for_user');
    expect(probe.opened).toBe(1);

    // The person signs in in the visible browser, then asks for a check.
    siteMode = 'signed_in';
    const recheck = await bridge(`/v1/login/${PROVIDER}/recheck`, { method: 'POST' });
    expect(recheck.status).toBe(202);
    expect(recheck.body.status).toBe('checking');

    const authed = await waitForState('authenticated');
    expect(authed.diagnostics?.reason).toBe('a provider session cookie is present for this profile');
    expect(loginStates()).toEqual(['starting', 'browser_ready', 'waiting_for_user', 'verifying', 'authenticated']);

    // The visible browser is closed before the profile is trusted.
    expect(probe.closed).toBeGreaterThan(0);

    const status = await bridge('/v1/status');
    expect(status.status).toBe(200);
    expect(status.body.providers[0].login.state).toBe('authenticated');
    expect(status.body.providers[0].login.message).toContain('Signed in to Grok');

    const loginStatus = await bridge(`/v1/login/${PROVIDER}/status`);
    expect(loginStatus.body.active).toBe(false);
    expect(loginStatus.body.login.state).toBe('authenticated');
  });

  it('reports a Cloudflare interstitial as challenge_detected and never touches the check', async () => {
    siteMode = 'challenge';
    const probe: DriverProbe = { opened: 0, closed: 0, calls: [] };
    h.driver = makeLoginDriver(probe);

    const started = await bridge(`/v1/login/${PROVIDER}`, { method: 'POST' });
    expect(started.status).toBe(202);

    const challenged = await waitForState('challenge_detected');
    expect(challenged.diagnostics?.challengeKind).toBe('cloudflare_managed');
    // The ray id is an opaque support reference, so it is safe to surface.
    expect(challenged.diagnostics?.rayId).toBe('abc123');

    // The copy hands the job to the person and offers the recheck afterwards.
    expect(challenged.message).toContain('Grok is running a security check');
    expect(challenged.nextAction).toContain('Open the login browser');
    expect(challenged.nextAction).toContain('Check login status');
    expect(challenged.nextAction).not.toMatch(/we (will|can) (solve|complete|handle)/i);

    // Nothing on the driver surface was ever reached for besides observing.
    expect(probe.calls.length).toBeGreaterThan(0);
    expect(probe.calls.filter(c => INTERACTION.test(c))).toEqual([]);
    const DRIVER_SURFACE = [
      'name', 'loginUrl', 'openLoginBrowser', 'observeLoginBrowser', 'closeLoginBrowser', 'verifySession',
    ];
    expect(probe.calls.filter(c => !DRIVER_SURFACE.includes(c))).toEqual([]);

    // And the challenge form was never posted, fetched or otherwise worked.
    expect(siteRequests.every(r => r.method === 'GET')).toBe(true);
    expect(siteRequests.some(r => r.path.includes('challenge-platform'))).toBe(false);
    expect(siteRequests.every(r => r.path === '/')).toBe(true);
  });

  it('reports a hard Cloudflare block as blocked, warns off retries and names a fallback', async () => {
    siteMode = 'blocked';
    const probe: DriverProbe = { opened: 0, closed: 0, calls: [] };
    h.driver = makeLoginDriver(probe);

    await bridge(`/v1/login/${PROVIDER}`, { method: 'POST' });

    const blocked = await waitForState('blocked');
    expect(blocked.diagnostics?.challengeKind).toBe('cloudflare_block');
    expect(blocked.diagnostics?.rayId).toBe('def456');
    expect(blocked.message).toContain('blocked by Grok');
    expect(blocked.nextAction).toContain('Do not retry immediately');
    // A blocked login must still leave the person a working transport.
    expect(blocked.nextAction).toMatch(/cli-grok\/\*|api-openrouter\/\*/);

    // Terminal: the browser is released and the session is no longer active.
    expect(probe.closed).toBeGreaterThan(0);
    const loginStatus = await bridge(`/v1/login/${PROVIDER}/status`);
    expect(loginStatus.body.active).toBe(false);
    expect(loginStatus.body.login.state).toBe('blocked');
  });

  it('ends a cancelled attempt at cancelled with the browser closed', async () => {
    const probe: DriverProbe = { opened: 0, closed: 0, calls: [] };
    h.driver = makeLoginDriver(probe);

    await bridge(`/v1/login/${PROVIDER}`, { method: 'POST' });
    await waitForState('waiting_for_user');

    const cancelled = await bridge(`/v1/login/${PROVIDER}/cancel`, { method: 'POST' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.login.state).toBe('cancelled');
    expect(cancelled.body.login.diagnostics.reason).toBe('cancelled by the user');
    expect(cancelled.body.login.message).toContain('was cancelled');

    expect(probe.closed).toBeGreaterThan(0);
    expect(loginStates()).toContain('cancelled');

    const loginStatus = await bridge(`/v1/login/${PROVIDER}/status`);
    expect(loginStatus.body.active).toBe(false);
    expect(loginStatus.body.login.state).toBe('cancelled');
  });

  it('never puts a cookie, credential or password on the wire', () => {
    // Both directions of the dashboard surface, across all four flows above.
    const wire = [...bridgeBodies, ...wireFrames];
    expect(wire.length).toBeGreaterThan(10);
    for (const payload of wire) {
      const lower = payload.toLowerCase();
      expect(lower).not.toContain(SITE_COOKIE_VALUE);
      expect(lower).not.toContain('set-cookie');
      expect(lower).not.toContain('__cf_bm');
      expect(lower).not.toContain('password');
      expect(lower).not.toContain('authorization');
      expect(lower).not.toContain('cf-turnstile-response');
    }
    // The bridge sets no cookies of its own either.
    expect(bridgeSetCookies.every(v => v === null)).toBe(true);
  });
});
