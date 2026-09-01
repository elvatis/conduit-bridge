import { describe, expect, it } from 'vitest';
import {
  DuplicateLoginError,
  LoginSessionManager,
  sanitize,
  type LoginBrowserObservation,
  type LoginDriver,
  type LoginVerification,
} from '../src/login/session-manager.js';
import type { LoginDiagnostics, LoginMode, LoginSnapshot, LoginTimings } from '../src/login/state.js';
import type { ProviderName } from '../src/types.js';

// ── Test seams ───────────────────────────────────────────────────────────────
//
// The manager polls in a loop whose only pauses are the injected `sleep` and
// the driver's own promises. `sleep` therefore resolves on a macrotask rather
// than a bare microtask: a microtask-only loop would refill the microtask
// queue forever and starve this file's own `waitFor` timers. setImmediate is
// still instant (no wall-clock budget), it just lets the event loop turn.
const tick = (): Promise<void> => new Promise<void>(resolve => setImmediate(resolve));

const VIEWER_URL = '/v1/login/grok/viewer';

const ALIVE_OK: LoginBrowserObservation = { alive: true, verdict: { verdict: 'ok' }, titleAvailable: true };

/**
 * Safety valve. Every scenario below drives the loop to a terminal state or
 * cancels it from an observation hook, so this should never fire; if a change
 * ever makes the loop run away, the suite fails on the state instead of
 * hanging forever.
 */
const MAX_OBSERVATIONS = 200;
const GUARD_OBSERVATION: LoginBrowserObservation = {
  alive: true,
  titleAvailable: true,
  verdict: { verdict: 'blocked', kind: 'cloudflare_block', signal: 'test guard: observation budget exhausted' },
};

interface Harness {
  manager: LoginSessionManager;
  /** Interleaved log of subscriber notifications and driver calls, in order. */
  events: string[];
  transitions: LoginSnapshot[];
  clock: { value: number };
  /** States seen so far, with consecutive repeats collapsed. */
  path(): string[];
}

const BASE_TIMINGS: Partial<LoginTimings> = {
  verifyingGraceMs: 10,
  challengeAnnounceMs: 20,
  stuckMs: 30,
  hardTimeoutMs: 60_000,
  pollIntervalMs: 0,
};

function setup(options: {
  timings?: Partial<LoginTimings>;
  mode?: LoginMode;
  onTransition?: (snapshot: LoginSnapshot) => void;
} = {}): Harness {
  const events: string[] = [];
  const transitions: LoginSnapshot[] = [];
  const clock = { value: 1_700_000_000_000 };
  let ids = 0;

  const manager = new LoginSessionManager({
    onTransition: snapshot => {
      transitions.push(snapshot);
      events.push(`state:${snapshot.state}`);
      options.onTransition?.(snapshot);
    },
    timings: { ...BASE_TIMINGS, ...options.timings },
    mode: options.mode,
    sleep: () => tick(),
    now: () => clock.value,
    newId: () => `test-${++ids}`,
  });

  return {
    manager,
    events,
    transitions,
    clock,
    path: () => transitions.map(t => t.state).filter((s, i, all) => i === 0 || s !== all[i - 1]),
  };
}

interface FakeDriverOptions {
  name?: ProviderName;
  loginUrl?: string;
  events?: string[];
  clock?: { value: number };
  /** Virtual milliseconds each observation costs. */
  clockStepMs?: number;
  openResult?: { viewerUrl: string | null; diagnostics: LoginDiagnostics };
  openError?: Error;
  observe?: (n: number) => LoginBrowserObservation;
  /** Runs inside the observation, so a test can act at an exact loop position. */
  onObserve?: (n: number) => void;
  /** Parks the observation until the test opens the gate. */
  observeGate?: Promise<void>;
  verification?: LoginVerification;
}

interface FakeDriver {
  driver: LoginDriver;
  calls: string[];
  count(call: string): number;
}

function makeDriver(options: FakeDriverOptions = {}): FakeDriver {
  const calls: string[] = [];
  const record = (call: string): void => {
    calls.push(call);
    options.events?.push(`call:${call}`);
  };
  let observations = 0;

  const driver: LoginDriver = {
    name: options.name ?? 'grok',
    loginUrl: options.loginUrl ?? 'https://grok.com/',
    async openLoginBrowser() {
      record('open');
      await tick();
      if (options.openError) throw options.openError;
      return options.openResult ?? { viewerUrl: VIEWER_URL, diagnostics: { displayOk: true } };
    },
    async observeLoginBrowser() {
      record('observe');
      observations += 1;
      if (options.clock) options.clock.value += options.clockStepMs ?? 5;
      if (options.observeGate) await options.observeGate;
      await tick();
      options.onObserve?.(observations);
      if (observations > MAX_OBSERVATIONS) return GUARD_OBSERVATION;
      return options.observe ? options.observe(observations) : ALIVE_OK;
    },
    async closeLoginBrowser() {
      record('close');
      await tick();
    },
    async verifySession() {
      record('verify');
      await tick();
      return options.verification ?? { authenticated: false, verdict: { verdict: 'ok' }, diagnostics: {} };
    },
  };

  return { driver, calls, count: call => calls.filter(c => c === call).length };
}

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>(resolve => { open = resolve; });
  return { promise, open };
}

/**
 * Polls a predicate on the macrotask queue. The ceiling exists only so a
 * regression fails loudly instead of hanging the suite — every scenario here
 * settles in a handful of event-loop turns.
 */
async function waitFor(predicate: () => boolean, label: string, ceilingMs = 2_000): Promise<void> {
  const deadline = Date.now() + ceilingMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise<void>(resolve => { setTimeout(resolve, 1); });
  }
}

// ── start() ──────────────────────────────────────────────────────────────────

describe('LoginSessionManager.start', () => {
  it('emits a starting snapshot synchronously and then reaches browser_ready', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => { if (n === 2) void h.manager.cancel('grok'); },
    });

    const started = h.manager.start(grok.driver);

    // The dashboard must be able to render the attempt before any browser work
    // happens, so the first snapshot has to be published synchronously.
    expect(started.state).toBe('starting');
    expect(h.transitions).toHaveLength(1);
    expect(h.transitions[0]).toBe(started);
    expect(started.sessionId).toBe('test-1');
    expect(started.loginUrl).toBe('https://grok.com/');
    expect(started.diagnostics?.browserMode).toBe('handoff');
    expect(started.startedAt).toBe(h.clock.value);
    expect(started.elapsedMs).toBe(0);
    expect(h.manager.active('grok')).toBe(true);

    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    const ready = h.transitions.find(t => t.state === 'browser_ready')!;
    expect(ready.viewerUrl).toBe(VIEWER_URL);
    expect(ready.diagnostics).toMatchObject({ browserMode: 'handoff', displayOk: true });
    expect(ready.message).toBe('The Grok login browser is open.');
    expect(ready.nextAction).toBe('Open the login browser and sign in as you normally would.');
    expect(grok.count('open')).toBe(1);
  });

  it('rejects a second attempt for the same provider without touching the first', async () => {
    const h = setup();
    const first = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => { if (n === 2) void h.manager.cancel('grok'); },
    });
    const second = makeDriver({ events: h.events, clock: h.clock });

    const started = h.manager.start(first.driver);
    expect(() => h.manager.start(second.driver)).toThrow(DuplicateLoginError);
    expect(() => h.manager.start(second.driver)).toThrow(/already in progress/);

    // The duplicate must not have launched anything, and the live attempt keeps
    // its identity so the dashboard does not swap sessions under the person.
    expect(second.count('open')).toBe(0);
    expect(first.count('open')).toBe(1);
    expect(h.manager.snapshot('grok')!.sessionId).toBe(started.sessionId);

    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');
    expect(second.calls).toEqual([]);
  });

  it('runs two providers concurrently with independent snapshots', async () => {
    const h = setup();
    const grokGate = gate();
    const chatgptGate = gate();
    const grok = makeDriver({ events: h.events, clock: h.clock, observeGate: grokGate.promise });
    const chatgpt = makeDriver({
      name: 'chatgpt',
      loginUrl: 'https://chatgpt.com/auth/login',
      events: h.events,
      clock: h.clock,
      observeGate: chatgptGate.promise,
      openResult: { viewerUrl: null, diagnostics: { displayOk: true } },
    });

    h.manager.start(grok.driver);
    h.manager.start(chatgpt.driver);

    // Both loops park inside their first observation, so the assertions below
    // run while the two attempts are genuinely live at the same time.
    await waitFor(() => grok.count('observe') === 1 && chatgpt.count('observe') === 1, 'both loops to park');

    expect(h.manager.active('grok')).toBe(true);
    expect(h.manager.active('chatgpt')).toBe(true);

    const list = h.manager.list();
    expect(list).toHaveLength(2);
    expect(list.map(s => s.provider).sort()).toEqual(['chatgpt', 'grok']);
    expect(new Set(list.map(s => s.sessionId)).size).toBe(2);

    const grokSnapshot = h.manager.snapshot('grok')!;
    const chatgptSnapshot = h.manager.snapshot('chatgpt')!;
    expect(grokSnapshot.state).toBe('browser_ready');
    expect(chatgptSnapshot.state).toBe('browser_ready');
    expect(grokSnapshot.loginUrl).toBe('https://grok.com/');
    expect(chatgptSnapshot.loginUrl).toBe('https://chatgpt.com/auth/login');
    expect(grokSnapshot.viewerUrl).toBe(VIEWER_URL);
    expect(chatgptSnapshot.viewerUrl).toBeUndefined();
    expect(chatgptSnapshot.message).toBe('The ChatGPT login browser is open.');

    // Release the gates and stop everything in the same synchronous turn, so
    // neither loop gets a chance to advance before the shutdown is recorded.
    grokGate.open();
    chatgptGate.open();
    await h.manager.stopAll();

    expect(h.manager.active('grok')).toBe(false);
    expect(h.manager.active('chatgpt')).toBe(false);
    for (const snapshot of h.manager.list()) {
      expect(snapshot.state).toBe('cancelled');
      expect(snapshot.diagnostics?.reason).toBe('the bridge is shutting down');
    }
    expect(grok.count('close')).toBe(1);
    expect(chatgpt.count('close')).toBe(1);
  });
});

// ── Observation handling ─────────────────────────────────────────────────────

describe('LoginSessionManager observation handling', () => {
  it('settles on waiting_for_user while the page looks ordinary', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => { if (n === 3) void h.manager.cancel('grok'); },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    expect(h.path()).toEqual(['starting', 'browser_ready', 'waiting_for_user', 'cancelled']);
    const waiting = h.transitions.find(t => t.state === 'waiting_for_user')!;
    expect(waiting.message).toBe('Waiting for you to finish signing in to Grok.');
    expect(waiting.nextAction).toContain('Check login status');
    expect(grok.count('verify')).toBe(0);
  });

  it('escalates a persistent interstitial to challenge_detected and tells the person to complete it themselves', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      clockStepMs: 5,
      observe: () => ({
        alive: true,
        titleAvailable: true,
        verdict: { verdict: 'verifying', kind: 'cloudflare_interactive', rayId: '8a1b2c3' },
      }),
      onObserve: n => { if (n === 6) void h.manager.cancel('grok'); },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    // Grace period first, then the announcement once the interstitial outlives
    // challengeAnnounceMs.
    expect(h.path()).toEqual(['starting', 'browser_ready', 'verifying', 'challenge_detected', 'cancelled']);
    const challenge = h.transitions.find(t => t.state === 'challenge_detected')!;
    expect(challenge.diagnostics).toMatchObject({
      challengeKind: 'cloudflare_interactive',
      widgetVisible: false,
      rayId: '8a1b2c3',
    });
    expect(challenge.message).toBe('Grok is showing a security check.');
    // Conduit detects and explains a security check; it never completes one.
    expect(challenge.nextAction).toContain('complete the check yourself');
    expect(challenge.nextAction).toContain('Conduit will not complete it for you.');
  });

  it('keeps a long-running security check open instead of ending the attempt', async () => {
    // A person may still be working through a legitimate check. Closing their
    // browser on a timer would take away the window they were told to use, so
    // elapsed time only sharpens the wording — it never ends the attempt.
    const h = setup({ timings: { challengeAnnounceMs: 15, stuckMs: 20, hardTimeoutMs: 90 } });
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      clockStepMs: 5,
      observe: () => ({ alive: true, titleAvailable: true, verdict: { verdict: 'verifying' } }),
      onObserve: n => { if (n === 12) void h.manager.cancel('grok'); },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    const states = h.path();
    expect(states).toContain('challenge_detected');
    expect(states).not.toContain('blocked');
    expect(states[states.length - 1]).toBe('cancelled');

    const stuck = h.transitions.filter(t => t.state === 'challenge_detected').pop()!;
    expect(stuck.diagnostics?.reason).toBe('the security check has been running for a long time');
    // The escalated wording names the honest alternative rather than pretending
    // another attempt will help.
    expect(stuck.nextAction).toContain('not letting this connection through');
    expect(stuck.nextAction).toContain('api-*');
  });

  it('treats a blocked verdict as immediate and terminal', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      observe: () => ({
        alive: true,
        titleAvailable: true,
        verdict: {
          verdict: 'blocked',
          kind: 'cloudflare_block',
          rayId: '9f2e1d0',
          signal: 'HTTP 403 from the provider edge',
        },
      }),
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    expect(h.path()).toEqual(['starting', 'browser_ready', 'blocked']);
    expect(grok.count('observe')).toBe(1);
    const blocked = h.manager.snapshot('grok')!;
    expect(blocked.diagnostics).toMatchObject({
      challengeKind: 'cloudflare_block',
      rayId: '9f2e1d0',
      reason: 'HTTP 403 from the provider edge',
    });
    expect(grok.count('verify')).toBe(0);
  });
});

// ── Verification ─────────────────────────────────────────────────────────────

describe('LoginSessionManager verification', () => {
  it('verifies as soon as the person closes the browser, with no recheck', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      observe: () => ({ alive: false, titleAvailable: false, verdict: { verdict: 'ok' } }),
      verification: {
        authenticated: true,
        verdict: { verdict: 'ok' },
        diagnostics: { finalUrl: 'https://grok.com/chat', pageTitle: 'Grok' },
      },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    expect(h.path()).toEqual(['starting', 'browser_ready', 'verifying', 'authenticated']);
    // Close still runs even though the window is gone: it is what releases the
    // provider's login flag and the profile lock, and skipping it left the
    // provider frozen for the rest of the process.
    expect(grok.calls).toEqual(['open', 'observe', 'close', 'verify']);
  });

  it('verifies on recheck and reopens the browser when the sign-in is not finished', async () => {
    const h = setup();
    let rechecked: LoginSnapshot | undefined;
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => {
        if (n === 1) rechecked = h.manager.recheck('grok');
        if (n === 5) void h.manager.cancel('grok');
      },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    expect(rechecked?.state).toBe('browser_ready');
    // The person is not signed in yet, so they get their browser back rather
    // than a dead end.
    expect(h.path()).toEqual([
      'starting', 'browser_ready', 'waiting_for_user', 'verifying', 'waiting_for_user', 'cancelled',
    ]);
    expect(grok.count('verify')).toBe(1);
    expect(grok.count('open')).toBe(2);
    const reopened = h.transitions.filter(t => t.state === 'waiting_for_user').at(-1)!;
    expect(reopened.viewerUrl).toBe(VIEWER_URL);
  });

  it('ends on authenticated and closes the browser when the session verifies', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => { if (n === 1) h.manager.recheck('grok'); },
      verification: {
        authenticated: true,
        verdict: { verdict: 'ok' },
        diagnostics: { finalUrl: 'https://grok.com/chat', httpStatus: 200 },
      },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    const final = h.manager.snapshot('grok')!;
    expect(final.state).toBe('authenticated');
    expect(final.message).toContain('Signed in to Grok');
    expect(final.diagnostics).toMatchObject({ finalUrl: 'https://grok.com/chat', httpStatus: 200 });
    expect(grok.count('close')).toBeGreaterThanOrEqual(1);
    expect(grok.count('open')).toBe(1);
    expect(h.manager.active('grok')).toBe(false);
  });

  it('reopens the browser and announces the check when verification finds a challenge', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => {
        if (n === 1) h.manager.recheck('grok');
        if (n === 3) void h.manager.cancel('grok');
      },
      verification: {
        authenticated: false,
        verdict: { verdict: 'challenge_detected', kind: 'cloudflare_interactive', rayId: '7c4b5a6' },
        diagnostics: { finalUrl: 'https://grok.com/sign-in' },
      },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    expect(h.path()).toEqual([
      'starting', 'browser_ready', 'waiting_for_user', 'verifying', 'challenge_detected', 'cancelled',
    ]);
    // The browser comes back so the person can complete the check themselves.
    expect(grok.count('open')).toBe(2);
    const challenge = h.transitions.find(t => t.state === 'challenge_detected')!;
    expect(challenge.viewerUrl).toBe(VIEWER_URL);
    expect(challenge.diagnostics).toMatchObject({
      challengeKind: 'cloudflare_interactive',
      rayId: '7c4b5a6',
      finalUrl: 'https://grok.com/sign-in',
    });
  });

  it('ends on blocked without reopening when verification is refused', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => { if (n === 1) h.manager.recheck('grok'); },
      verification: {
        authenticated: false,
        verdict: {
          verdict: 'blocked',
          kind: 'cloudflare_block',
          rayId: '1d5c6b7',
          signal: 'HTTP 503 from the provider edge',
        },
        diagnostics: { httpStatus: 503 },
      },
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    const blocked = h.manager.snapshot('grok')!;
    expect(blocked.state).toBe('blocked');
    // Reopening a browser the provider has refused would only invite a longer
    // block, so the attempt stops here.
    expect(grok.count('open')).toBe(1);
    expect(blocked.diagnostics).toMatchObject({
      challengeKind: 'cloudflare_block',
      rayId: '1d5c6b7',
      httpStatus: 503,
      reason: 'HTTP 503 from the provider edge',
    });
    expect(blocked.nextAction).toContain('Do not retry immediately');
  });

  it('answers recheck for a provider with no live attempt instead of throwing', async () => {
    const h = setup();
    expect(h.manager.recheck('gemini')).toBeUndefined();

    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      observe: () => ({ alive: true, titleAvailable: true, verdict: { verdict: 'blocked', kind: 'cloudflare_block' } }),
    });
    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    expect(h.manager.recheck('grok')!.state).toBe('blocked');
    expect(grok.count('verify')).toBe(0);
  });
});

// ── Budgets ──────────────────────────────────────────────────────────────────

describe('LoginSessionManager timeout', () => {
  it('ends on timeout and closes the browser once the hard budget is spent', async () => {
    const h = setup({ timings: { hardTimeoutMs: 25 } });
    const grok = makeDriver({ events: h.events, clock: h.clock, clockStepMs: 10 });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    // The budget is checked, then one last verification runs — a sign-in
    // completed just before the deadline must be reported as success, not as a
    // timeout — and only then does the attempt give up.
    expect(h.path()).toEqual(['starting', 'browser_ready', 'waiting_for_user', 'verifying', 'waiting_for_user', 'timeout']);
    const timedOut = h.manager.snapshot('grok')!;
    expect(timedOut.diagnostics?.reason).toBe('no sign-in was completed within the time limit');
    expect(timedOut.message).toBe('The Grok login did not finish in time.');
    expect(timedOut.nextAction).toContain('Nothing was changed.');
    // Twice: the last-chance verification closes the window, finds no session
    // and reopens it, and the timeout then closes that one too. Nothing is left
    // running either way.
    expect(grok.count('close')).toBe(2);
    expect(timedOut.elapsedMs).toBeGreaterThanOrEqual(25);
  });
});

// ── Cancellation ─────────────────────────────────────────────────────────────

describe('LoginSessionManager cancellation', () => {
  it('marks the attempt cancelled before any browser teardown', async () => {
    const h = setup();
    const observeGate = gate();
    const grok = makeDriver({ events: h.events, clock: h.clock, observeGate: observeGate.promise });

    h.manager.start(grok.driver);
    await waitFor(() => grok.count('observe') === 1, 'the loop to park in an observation');

    const pending = h.manager.cancel('grok');
    // Synchronously, before the teardown can even start: this ordering is what
    // keeps a cancel from ever surfacing as a login failure.
    expect(h.manager.snapshot('grok')!.state).toBe('cancelled');
    expect(h.events).toContain('state:cancelled');
    expect(h.events).not.toContain('call:close');

    observeGate.open();
    const cancelled = await pending;

    expect(cancelled!.state).toBe('cancelled');
    expect(cancelled!.diagnostics?.reason).toBe('cancelled by the user');
    expect(cancelled!.message).toBe('The Grok login was cancelled.');
    expect(h.events.indexOf('state:cancelled')).toBeLessThan(h.events.indexOf('call:close'));
    expect(h.events).not.toContain('state:failed');
    expect(grok.count('close')).toBe(1);
    expect(h.manager.active('grok')).toBe(false);
  });

  it('resolves quietly when cancelling a provider with no attempt', async () => {
    const h = setup();
    await expect(h.manager.cancel('gemini')).resolves.toBeUndefined();
  });

  it('stopAll cancels every live attempt', async () => {
    const h = setup();
    const gates = [gate(), gate()];
    const grok = makeDriver({ events: h.events, clock: h.clock, observeGate: gates[0].promise });
    const claude = makeDriver({
      name: 'claude',
      loginUrl: 'https://claude.ai/login',
      events: h.events,
      clock: h.clock,
      observeGate: gates[1].promise,
    });

    h.manager.start(grok.driver);
    h.manager.start(claude.driver);
    await waitFor(() => grok.count('observe') === 1 && claude.count('observe') === 1, 'both loops to park');

    gates[0].open();
    gates[1].open();
    await h.manager.stopAll();

    expect(h.manager.list().map(s => s.state)).toEqual(['cancelled', 'cancelled']);
    expect(h.manager.snapshot('claude')!.message).toBe('The Claude login was cancelled.');
    expect(grok.count('close')).toBe(1);
    expect(claude.count('close')).toBe(1);
  });
});

// ── Cleanup and resilience ───────────────────────────────────────────────────

describe('LoginSessionManager cleanup', () => {
  it('releases the provider after a terminal state and accepts a fresh attempt', async () => {
    const h = setup();
    const first = makeDriver({
      events: h.events,
      clock: h.clock,
      observe: () => ({ alive: true, titleAvailable: true, verdict: { verdict: 'blocked', kind: 'cloudflare_block' } }),
    });

    const firstSnapshot = h.manager.start(first.driver);
    await waitFor(() => !h.manager.active('grok'), 'the first attempt to settle');

    expect(h.manager.active('grok')).toBe(false);
    expect(h.manager.snapshot('grok')!.state).toBe('blocked');
    expect(h.manager.list().map(s => s.provider)).toEqual(['grok']);

    const second = makeDriver({
      events: h.events,
      clock: h.clock,
      onObserve: n => { if (n === 2) void h.manager.cancel('grok'); },
    });
    const secondSnapshot = h.manager.start(second.driver);

    expect(secondSnapshot.sessionId).not.toBe(firstSnapshot.sessionId);
    expect(secondSnapshot.state).toBe('starting');
    await waitFor(() => !h.manager.active('grok'), 'the second attempt to settle');
    expect(h.manager.snapshot('grok')!.state).toBe('cancelled');
  });

  it('survives a subscriber that throws on every transition', async () => {
    const h = setup({
      onTransition: () => { throw new Error('dashboard subscriber exploded'); },
    });
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      observe: () => ({ alive: true, titleAvailable: true, verdict: { verdict: 'blocked', kind: 'cloudflare_block' } }),
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    // A broken listener must not strand the login or leak into its diagnostics.
    expect(h.manager.snapshot('grok')!.state).toBe('blocked');
    expect(h.manager.snapshot('grok')!.diagnostics?.reason).toBeUndefined();
    expect(h.path()).toEqual(['starting', 'browser_ready', 'blocked']);
  });

  it('reports a browser that will not launch as failed, with a sanitized reason', async () => {
    const h = setup();
    const grok = makeDriver({
      events: h.events,
      clock: h.clock,
      openError: new Error('chromium exited\n  code 1  https://example.test/login?redirect=1'),
    });

    h.manager.start(grok.driver);
    await waitFor(() => !h.manager.active('grok'), 'the attempt to settle');

    const failed = h.manager.snapshot('grok')!;
    expect(failed.state).toBe('failed');
    expect(failed.diagnostics?.reason).toBe('chromium exited code 1 https://example.test/login');
    expect(failed.message).toBe('The Grok login could not be started.');
    expect(failed.nextAction).toContain('cli-grok/*');
    // No browser was ever open, so nothing is torn down.
    expect(grok.calls).toEqual(['open']);
  });
});

// ── sanitize() ───────────────────────────────────────────────────────────────

describe('sanitize', () => {
  it('drops query strings so nothing from a login URL leaks into a message', () => {
    expect(sanitize(new Error('navigation to https://grok.com/sign-in?code=abc123 failed')))
      .toBe('navigation to https://grok.com/sign-in failed');
  });

  it('collapses whitespace into one line', () => {
    expect(sanitize(new Error('browser\n\tcrashed   while   loading'))).toBe('browser crashed while loading');
  });

  it('caps the length', () => {
    expect(sanitize(new Error('x'.repeat(400)))).toHaveLength(240);
  });

  it('handles values that are not Errors', () => {
    expect(sanitize('plain failure')).toBe('plain failure');
    expect(sanitize(null)).toBe('unknown error');
    expect(sanitize(undefined)).toBe('unknown error');
    expect(sanitize(1006)).toBe('1006');
  });
});
