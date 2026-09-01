import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGIN_TIMINGS,
  LOGIN_STATES,
  TERMINAL_LOGIN_STATES,
  applyTransition,
  canTransition,
  isActionableLoginState,
  isTerminalLoginState,
  newLoginSnapshot,
  resolveLoginTimings,
} from '../src/login/state.js';
import type { ChallengeKind, LoginSnapshot, LoginState } from '../src/login/state.js';
import { copyFor, providerLabel, restoreFailureCopy } from '../src/login/copy.js';
import type { LoginAction } from '../src/login/copy.js';
import type { ProviderName } from '../src/types.js';

const WEB_PROVIDERS: ProviderName[] = ['grok', 'claude', 'gemini', 'chatgpt', 'perplexity'];

const TERMINAL: LoginState[] = ['authenticated', 'blocked', 'timeout', 'failed', 'cancelled'];
const NON_TERMINAL: LoginState[] = ['starting', 'browser_ready', 'waiting_for_user', 'verifying', 'challenge_detected'];

const CHALLENGE_KINDS: (ChallengeKind | undefined)[] = [
  undefined, 'cloudflare_managed', 'cloudflare_interactive', 'cloudflare_block', 'google_untrusted_browser', 'unknown',
];

// A fixed epoch so every timing assertion is arithmetic, never wall-clock.
const START = 1_700_000_000_000;

function snapshotIn(state: LoginState, extra: Partial<LoginSnapshot> = {}): LoginSnapshot {
  return { ...newLoginSnapshot('claude', 'sess-1', 'a message', START), state, ...extra };
}

describe('LOGIN_STATES', () => {
  it('contains exactly the ten documented states', () => {
    expect([...LOGIN_STATES].sort()).toEqual([
      'authenticated', 'blocked', 'browser_ready', 'cancelled', 'challenge_detected',
      'failed', 'starting', 'timeout', 'verifying', 'waiting_for_user',
    ]);
    expect(LOGIN_STATES).toHaveLength(10);
    expect(new Set(LOGIN_STATES).size).toBe(10);
  });
});

describe('terminal states', () => {
  it('treats exactly authenticated/blocked/timeout/failed/cancelled as terminal', () => {
    expect([...TERMINAL_LOGIN_STATES].sort()).toEqual([...TERMINAL].sort());
    for (const state of TERMINAL) expect(isTerminalLoginState(state)).toBe(true);
    for (const state of NON_TERMINAL) expect(isTerminalLoginState(state)).toBe(false);
  });

  it('never marks challenge_detected terminal, because a person finishes the check and the attempt continues', () => {
    expect(isTerminalLoginState('challenge_detected')).toBe(false);
    expect(TERMINAL_LOGIN_STATES.has('challenge_detected')).toBe(false);
    // The whole manual-handoff design depends on this path staying open.
    expect(canTransition('challenge_detected', 'verifying')).toBe(true);
    expect(canTransition('verifying', 'authenticated')).toBe(true);
  });
});

describe('canTransition', () => {
  it('gives every terminal state no outgoing transition at all', () => {
    for (const from of TERMINAL) {
      for (const to of LOGIN_STATES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
      }
    }
  });

  it('rejects a self-transition for every state', () => {
    for (const state of LOGIN_STATES) expect(canTransition(state, state)).toBe(false);
  });

  it('allows the representative legal moves of a normal login', () => {
    const legal: [LoginState, LoginState][] = [
      ['starting', 'browser_ready'],
      ['browser_ready', 'waiting_for_user'],
      ['waiting_for_user', 'verifying'],
      ['verifying', 'authenticated'],
      ['verifying', 'waiting_for_user'],
      ['challenge_detected', 'verifying'],
    ];
    for (const [from, to] of legal) expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
  });

  it('rejects moves that would rewind or resurrect an attempt', () => {
    const illegal: [LoginState, LoginState][] = [
      ['authenticated', 'verifying'],
      ['waiting_for_user', 'starting'],
      ['blocked', 'verifying'],
      ['blocked', 'waiting_for_user'],
      ['blocked', 'authenticated'],
      ['cancelled', 'browser_ready'],
      ['timeout', 'challenge_detected'],
    ];
    for (const [from, to] of illegal) expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
  });

  it('lets every non-terminal state reach a terminal one, so no attempt can hang forever', () => {
    for (const from of NON_TERMINAL) {
      const outgoing = LOGIN_STATES.filter(to => canTransition(from, to));
      expect(outgoing.length, `${from} has no outgoing transition`).toBeGreaterThan(0);
      expect(outgoing.some(to => isTerminalLoginState(to)), `${from} cannot terminate`).toBe(true);
      expect(canTransition(from, 'cancelled'), `${from} cannot be cancelled`).toBe(true);
    }
  });
});

describe('isActionableLoginState', () => {
  it('marks only the states a person can act on from the dashboard', () => {
    const actionable = LOGIN_STATES.filter(isActionableLoginState);
    expect([...actionable].sort()).toEqual(['browser_ready', 'challenge_detected', 'waiting_for_user']);
  });
});

describe('applyTransition', () => {
  it('returns the very same object on an illegal transition, so callers can detect a no-op by identity', () => {
    const prev = snapshotIn('authenticated');
    const next = applyTransition(prev, 'verifying', { message: 'ignored' }, START + 1_000);
    expect(next).toBe(prev);
    expect(next.message).toBe('a message');
  });

  it('leaves the previous snapshot untouched on a legal transition', () => {
    const prev = snapshotIn('starting');
    const next = applyTransition(prev, 'browser_ready', { message: 'open' }, START + 500);
    expect(next).not.toBe(prev);
    expect(prev.state).toBe('starting');
    expect(prev.updatedAt).toBe(START);
    expect(prev.message).toBe('a message');
  });

  it('carries the attempt identity through and recomputes elapsedMs from startedAt', () => {
    const prev = snapshotIn('waiting_for_user');
    const next = applyTransition(prev, 'verifying', {}, START + 12_345);
    expect(next.state).toBe('verifying');
    expect(next.provider).toBe('claude');
    expect(next.sessionId).toBe('sess-1');
    expect(next.startedAt).toBe(START);
    expect(next.updatedAt).toBe(START + 12_345);
    expect(next.elapsedMs).toBe(12_345);
  });

  it('clamps elapsedMs at zero when the injected clock moves backwards', () => {
    // A backwards clock must never surface as a negative duration in the UI.
    const prev = snapshotIn('verifying');
    const next = applyTransition(prev, 'authenticated', {}, START - 5_000);
    expect(next.elapsedMs).toBe(0);
    expect(next.updatedAt).toBe(START - 5_000);
  });

  it('merges diagnostics instead of replacing them', () => {
    const prev = snapshotIn('waiting_for_user', {
      diagnostics: { browserMode: 'handoff', displayOk: true, finalUrl: 'https://claude.ai/login' },
    });
    const next = applyTransition(
      prev,
      'challenge_detected',
      { diagnostics: { challengeKind: 'cloudflare_interactive', widgetVisible: true } },
      START + 1_000,
    );
    expect(next.diagnostics).toEqual({
      browserMode: 'handoff',
      displayOk: true,
      finalUrl: 'https://claude.ai/login',
      challengeKind: 'cloudflare_interactive',
      widgetVisible: true,
    });
    // The merge must not write through to the previous snapshot's object.
    expect(prev.diagnostics).not.toHaveProperty('challengeKind');
  });

  it('keeps existing diagnostics when the patch carries none', () => {
    const diagnostics = { browserMode: 'assisted' as const, rayId: '8ab' };
    const prev = snapshotIn('browser_ready', { diagnostics });
    const next = applyTransition(prev, 'waiting_for_user', { message: 'waiting' }, START + 10);
    expect(next.diagnostics).toBe(diagnostics);
  });

  it('applies the patch fields it is given', () => {
    const prev = snapshotIn('browser_ready');
    const next = applyTransition(
      prev,
      'challenge_detected',
      { message: 'security check', nextAction: 'complete it yourself', viewerUrl: '/v1/login/grok/viewer' },
      START + 20,
    );
    expect(next.message).toBe('security check');
    expect(next.nextAction).toBe('complete it yourself');
    expect(next.viewerUrl).toBe('/v1/login/grok/viewer');
  });

  it('lets a same-state call refresh diagnostics without changing state', () => {
    // KNOWN GAP (reported, not fixed here): the `prev.state !== to` short-circuit
    // means an equal target never consults canTransition, which returns false for
    // x -> x — so even a terminal snapshot is rebuilt with a bumped updatedAt.
    // Unreachable today because LoginSessionManager._transition returns early on
    // a terminal state, and it is the only caller. Pinned as current behaviour.
    const prev = snapshotIn('verifying', { diagnostics: { browserMode: 'handoff' } });
    const next = applyTransition(prev, 'verifying', { diagnostics: { httpStatus: 403 } }, START + 30);
    expect(next).not.toBe(prev);
    expect(next.state).toBe('verifying');
    expect(next.diagnostics).toEqual({ browserMode: 'handoff', httpStatus: 403 });
  });
});

describe('newLoginSnapshot', () => {
  it('starts an attempt in `starting` with a zero elapsed time and no diagnostics', () => {
    const snap = newLoginSnapshot('grok', 'sess-7', 'Preparing a browser session for Grok.', START);
    expect(snap).toEqual({
      provider: 'grok',
      sessionId: 'sess-7',
      state: 'starting',
      startedAt: START,
      updatedAt: START,
      elapsedMs: 0,
      message: 'Preparing a browser session for Grok.',
    });
    expect(snap.diagnostics).toBeUndefined();
    expect(snap.nextAction).toBeUndefined();
    expect(snap.viewerUrl).toBeUndefined();
  });
});

describe('login timings', () => {
  it('orders the default budgets from the shortest grace to the hard timeout', () => {
    const d = DEFAULT_LOGIN_TIMINGS;
    expect(d.verifyingGraceMs).toBeLessThan(d.challengeAnnounceMs);
    expect(d.challengeAnnounceMs).toBeLessThan(d.stuckMs);
    expect(d.stuckMs).toBeLessThan(d.hardTimeoutMs);
    // Sampling has to be far finer than the shortest budget it drives.
    expect(d.pollIntervalMs).toBeLessThan(d.verifyingGraceMs);
    for (const value of Object.values(d)) expect(value).toBeGreaterThan(0);
  });

  it('returns a fresh copy of the defaults when nothing is overridden', () => {
    const resolved = resolveLoginTimings();
    expect(resolved).toEqual(DEFAULT_LOGIN_TIMINGS);
    // A shared reference would let one session's edits leak into the next.
    expect(resolved).not.toBe(DEFAULT_LOGIN_TIMINGS);
    resolved.hardTimeoutMs = 1;
    expect(DEFAULT_LOGIN_TIMINGS.hardTimeoutMs).toBe(300_000);
  });

  it('merges partial overrides and leaves unspecified fields alone', () => {
    const resolved = resolveLoginTimings({ hardTimeoutMs: 2_000, pollIntervalMs: 25 });
    expect(resolved.hardTimeoutMs).toBe(2_000);
    expect(resolved.pollIntervalMs).toBe(25);
    expect(resolved.verifyingGraceMs).toBe(DEFAULT_LOGIN_TIMINGS.verifyingGraceMs);
    expect(resolved.challengeAnnounceMs).toBe(DEFAULT_LOGIN_TIMINGS.challengeAnnounceMs);
    expect(resolved.stuckMs).toBe(DEFAULT_LOGIN_TIMINGS.stuckMs);
    expect(resolved.stuckMs).toBe(DEFAULT_LOGIN_TIMINGS.stuckMs);
    expect(resolved.browserCloseMs).toBe(DEFAULT_LOGIN_TIMINGS.browserCloseMs);
    expect(resolved.profileReleaseMs).toBe(DEFAULT_LOGIN_TIMINGS.profileReleaseMs);
  });

  it('ignores an undefined override object', () => {
    expect(resolveLoginTimings(undefined)).toEqual(DEFAULT_LOGIN_TIMINGS);
    expect(resolveLoginTimings({})).toEqual(DEFAULT_LOGIN_TIMINGS);
  });
});

// ── User-facing copy ─────────────────────────────────────────────────────────

const KNOWN_ACTIONS: LoginAction[] = ['open_browser', 'recheck', 'cancel', 'retry', 'use_api_key', 'none'];

/** Words that would mean an implementation detail escaped into the main view. */
const LEAKY = ['.prosemirror', 'locator', 'selector', 'playwright', 'undefined', 'null', 'cdp', 'xpath'];
const STACK_MARKERS = [/\n\s*at\s/, /\.[tj]s:\d+/, /node_modules/, /\berror:\s/i];

function textOf(copy: { message: string; nextAction?: string }): string {
  return `${copy.message} ${copy.nextAction ?? ''}`;
}

describe('copyFor', () => {
  it('has a non-empty message and at least one action for every state and every web provider', () => {
    for (const provider of WEB_PROVIDERS) {
      for (const state of LOGIN_STATES) {
        for (const challengeKind of CHALLENGE_KINDS) {
          const copy = copyFor(provider, state, { challengeKind });
          const where = `${provider}/${state}/${challengeKind ?? 'no-kind'}`;
          expect(copy.message.trim().length, where).toBeGreaterThan(0);
          expect(copy.actions.length, where).toBeGreaterThan(0);
          for (const action of copy.actions) expect(KNOWN_ACTIONS, where).toContain(action);
        }
      }
    }
  });

  it('names the provider in every message', () => {
    for (const provider of WEB_PROVIDERS) {
      for (const state of LOGIN_STATES) {
        const copy = copyFor(provider, state);
        expect(copy.message, `${provider}/${state}`).toContain(providerLabel(provider));
      }
    }
  });

  it('never leaks selectors, library names, stack traces or raw undefined/null', () => {
    for (const provider of WEB_PROVIDERS) {
      for (const state of LOGIN_STATES) {
        for (const challengeKind of CHALLENGE_KINDS) {
          const text = textOf(copyFor(provider, state, { challengeKind }));
          const where = `${provider}/${state}/${challengeKind ?? 'no-kind'}`;
          for (const needle of LEAKY) expect(text.toLowerCase(), `${where}: ${needle}`).not.toContain(needle);
          for (const marker of STACK_MARKERS) expect(text, `${where}: ${marker}`).not.toMatch(marker);
        }
      }
    }
  });

  it('keeps machine text out of the failed copy', () => {
    // The docs promise every technical detail sits behind the disclosure, so
    // the sentence the person reads first must never carry the raw reason.
    const raw = 'browserType.launchPersistentContext: Target page closed';
    const copy = copyFor('claude', 'failed', { reason: raw });
    expect(copy.message).toBe('The Claude login could not be started.');
    expect(copy.nextAction).not.toContain(raw);
    expect(copy.nextAction).not.toContain('launchPersistentContext');
    expect(copy.nextAction).toContain('technical details');
    expect(copy.nextAction).toContain('api-claude/*');
  });

  it('offers no next action once the person is signed in', () => {
    const copy = copyFor('claude', 'authenticated');
    expect(copy.message).toMatch(/signed in to claude/i);
    expect(copy.actions).toEqual(['none']);
    expect(copy.nextAction).toBeUndefined();
  });

  it('tells the person to complete a security check themselves and never offers to do it for them', () => {
    for (const provider of WEB_PROVIDERS) {
      for (const kind of ['cloudflare_interactive', 'cloudflare_managed', undefined] as (ChallengeKind | undefined)[]) {
        const copy = copyFor(provider, 'challenge_detected', { challengeKind: kind });
        const text = textOf(copy);
        const where = `${provider}/${kind ?? 'no-kind'}`;
        expect(copy.nextAction, where).toBeDefined();
        // The person must be pointed at the visible browser, not at a button that "handles" it.
        expect(copy.nextAction!, where).toMatch(/open the login browser/i);
        expect(copy.actions, where).toContain('open_browser');
        expect(copy.actions, where).toContain('recheck');
        expect(text, where).not.toMatch(/bypass|circumvent|solv|work around|automatically (?:complete|pass|clear)/i);
        expect(text, where).not.toMatch(/conduit will (?:complete|solve|handle|pass|click)/i);
      }
    }
  });

  it('says outright that Conduit will not complete an interactive check', () => {
    const copy = copyFor('grok', 'challenge_detected', { challengeKind: 'cloudflare_interactive' });
    expect(copy.nextAction).toMatch(/complete the check yourself/i);
    expect(copy.nextAction).toMatch(/conduit will not complete it for you/i);
  });

  it('warns against immediate retries and offers an api-*/cli-* alternative when blocked', () => {
    for (const provider of WEB_PROVIDERS) {
      const copy = copyFor(provider, 'blocked');
      expect(copy.nextAction, provider).toMatch(/do not retry immediately/i);
      expect(copy.nextAction!, provider).toMatch(/repeated attempts can extend the block/i);
      // Every blocked provider must name a transport that still works today.
      expect(copy.nextAction!, provider).toMatch(/\b(?:api|cli)-[a-z]+\/\*/);
      expect(copy.actions, provider).toEqual(['retry', 'use_api_key']);
    }
  });

  it('names the concrete fallback transports per provider', () => {
    expect(copyFor('claude', 'blocked').nextAction).toContain('api-claude/*');
    expect(copyFor('claude', 'blocked').nextAction).toContain('cli-claude/*');
    expect(copyFor('chatgpt', 'blocked').nextAction).toContain('api-codex/*');
    expect(copyFor('grok', 'blocked').nextAction).toContain('cli-grok/*');
    expect(copyFor('perplexity', 'blocked').nextAction).toContain('api-perplexity/*');
    expect(copyFor('gemini', 'blocked').nextAction).toContain('api-gemini/*');
  });

  it("explains Google's refusal specifically, distinct from the generic blocked copy", () => {
    const google = copyFor('gemini', 'blocked', { challengeKind: 'google_untrusted_browser' });
    const generic = copyFor('gemini', 'blocked');
    expect(google.message).not.toBe(generic.message);
    expect(google.nextAction).not.toBe(generic.nextAction);
    expect(google.message).toMatch(/google declined the sign-in/i);
    // The kind carries no information about HOW the browser was launched — and
    // in the default handoff mode there is no automation at all — so the copy
    // must not assert one. It says what Google decided and what to do instead.
    expect(google.nextAction!).not.toMatch(/automation/i);
    expect(google.nextAction!).toMatch(/trustworthy/i);
    expect(google.nextAction!).toMatch(/browser you already use/i);
    expect(google.nextAction!).toContain('api-gemini/*');
  });

  it('promises nothing about a retry after a timeout and states nothing was changed', () => {
    const copy = copyFor('chatgpt', 'timeout');
    expect(copy.message).toMatch(/did not finish in time/i);
    expect(copy.nextAction).toMatch(/nothing was changed/i);
  });

  it('falls back to the failed copy for an unrecognised state', () => {
    const copy = copyFor('claude', 'not-a-state' as LoginState);
    expect(copy.message).toBe(copyFor('claude', 'failed').message);
    expect(copy.actions).toEqual(['retry', 'use_api_key']);
  });
});

describe('providerLabel', () => {
  it('capitalises the web providers and passes anything else through unchanged', () => {
    expect(WEB_PROVIDERS.map(providerLabel)).toEqual(['Grok', 'Claude', 'Gemini', 'ChatGPT', 'Perplexity']);
    expect(providerLabel('claude-api')).toBe('claude-api');
  });
});

describe('restoreFailureCopy', () => {
  it('distinguishes blocked, challenge_detected and a plain reason', () => {
    const blocked = restoreFailureCopy('claude', 'blocked');
    const challenge = restoreFailureCopy('claude', 'challenge_detected');
    const reason = restoreFailureCopy('claude', 'failed', { reason: 'the saved profile has no session cookie' });
    const plain = restoreFailureCopy('claude', 'failed');
    expect(new Set([blocked, challenge, reason, plain]).size).toBe(4);

    expect(blocked).toMatch(/refused the saved session/i);
    expect(blocked).toContain('api-claude/*');
    // A challenge is not a dead end: it routes the person into a browser login.
    expect(challenge).toMatch(/only a person can complete/i);
    expect(challenge).toMatch(/start a browser login/i);
    expect(reason).toContain('the saved profile has no session cookie');
    expect(plain).toMatch(/saved profile but is not signed in/i);
  });

  it('names the provider and leaks no internals for any state', () => {
    for (const provider of WEB_PROVIDERS) {
      for (const state of LOGIN_STATES) {
        const line = restoreFailureCopy(provider, state);
        expect(line, `${provider}/${state}`).toContain(providerLabel(provider));
        for (const needle of LEAKY) expect(line.toLowerCase(), `${provider}/${state}: ${needle}`).not.toContain(needle);
        for (const marker of STACK_MARKERS) expect(line, `${provider}/${state}`).not.toMatch(marker);
      }
    }
  });

  it('never claims Conduit will clear the check itself', () => {
    const line = restoreFailureCopy('gemini', 'challenge_detected');
    expect(line).not.toMatch(/bypass|circumvent|solv|automatically/i);
  });
});
