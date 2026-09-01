// Spec item 8 (login success detection) and item 14 (external authentication).
//
// Three of the five browser providers ship a `verifySelector` that also matches
// while the session is SIGNED OUT (perplexity's bare textarea, claude's editor
// shell, chatgpt's prompt box). "Selector visible" therefore used to mark a
// provider connected that could not answer a single request. decideAuthenticated
// is the guard against that false green, so these tests pin its whole decision
// table — including the cases where a positive signal must lose.

import { describe, it, expect } from 'vitest';
import {
  authSignalsFor,
  decideAuthenticated,
  type AuthObservation,
  type AuthSignals,
} from '../src/login/auth-signals.js';
import type { ProviderName } from '../src/types.js';

/** The providers that authenticate through a real browser session. */
const WEB_PROVIDERS: readonly ProviderName[] = ['grok', 'claude', 'gemini', 'chatgpt', 'perplexity'];

/** A signed-out-looking baseline on a product page: every signal off. */
function observation(over: Partial<AuthObservation> = {}): AuthObservation {
  return {
    host: 'claude.ai',
    path: '/chats',
    hasSessionCookie: false,
    verifySelectorVisible: false,
    authedSelectorVisible: false,
    loggedOutSelectorVisible: false,
    ...over,
  };
}

function allStrings(signals: AuthSignals): string[] {
  return [
    ...signals.sessionCookieNames,
    ...signals.loginHostnames,
    ...signals.authedSelectors,
    ...signals.loggedOutSelectors,
  ];
}

/**
 * Reasons are rendered verbatim in the login panel and in restore logs, so they
 * must read as prose. Selector syntax leaking out would tell the person nothing
 * they can act on and would expose DOM internals in user-facing copy.
 */
function expectHumanReadable(reason: string): void {
  expect(reason.trim().length).toBeGreaterThan(10);
  expect(reason).not.toContain('[');
  expect(reason).not.toContain('#');
  expect(reason).not.toContain('.ProseMirror');
  expect(reason).not.toContain(':has-text');
  expect(reason).not.toContain('<');
  // Words, spaces and ordinary punctuation only — no CSS, no code.
  expect(reason).toMatch(/^[a-z][a-z ,'-]+$/i);
}

/** Every combination of the four boolean observations, on several locations. */
function fullMatrix(): AuthObservation[] {
  const places = [
    { host: 'claude.ai', path: '/chats' },
    { host: 'www.perplexity.ai', path: '/' },
    { host: 'gemini.google.com', path: '/app' },
    { host: 'claude.ai', path: '/login' },
    { host: 'accounts.google.com', path: '/signin/v2/identifier' },
  ];
  const out: AuthObservation[] = [];
  for (const place of places) {
    for (let bits = 0; bits < 16; bits += 1) {
      out.push({
        ...place,
        hasSessionCookie: Boolean(bits & 1),
        verifySelectorVisible: Boolean(bits & 2),
        authedSelectorVisible: Boolean(bits & 4),
        loggedOutSelectorVisible: Boolean(bits & 8),
      });
    }
  }
  return out;
}

describe('authSignalsFor', () => {
  it('describes every browser-login provider', () => {
    for (const provider of WEB_PROVIDERS) {
      const signals = authSignalsFor(provider);
      // A provider with no logged-out selectors has no way to veto a false
      // green, which is the whole point of the descriptor.
      expect(signals.loggedOutSelectors.length, provider).toBeGreaterThan(0);
      expect(signals.sessionCookieNames.length, provider).toBeGreaterThan(0);
      // loginHostnames lists only hosts that exist solely to sign in, so a
      // provider whose product and sign-in pages share a host has none. Those
      // are vetoed by the path check instead.
      expect(Array.isArray(signals.loginHostnames), provider).toBe(true);
      expect(Array.isArray(signals.authedSelectors), provider).toBe(true);
      for (const value of allStrings(signals)) {
        expect(typeof value).toBe('string');
        expect(value.trim()).toBe(value);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns the conservative fallback for an unknown provider instead of throwing', () => {
    const unknown = authSignalsFor('not-a-provider' as ProviderName);
    expect(unknown.sessionCookieNames).toEqual([]);
    expect(unknown.loginHostnames).toEqual([]);
    expect(unknown.authedSelectors).toEqual([]);
    // The fallback still carries sign-in affordances so an unknown provider can
    // only ever be judged more strictly, never less.
    expect(unknown.loggedOutSelectors.length).toBeGreaterThan(0);
  });

  it('falls back for non-browser providers rather than inventing signals', () => {
    for (const provider of ['claude-api', 'cli-claude', 'lmstudio'] as ProviderName[]) {
      const signals = authSignalsFor(provider);
      expect(signals.sessionCookieNames, provider).toEqual([]);
      expect(signals.loginHostnames, provider).toEqual([]);
    }
  });

  it('lists cookie NAMES only', () => {
    for (const provider of WEB_PROVIDERS) {
      for (const name of authSignalsFor(provider).sessionCookieNames) {
        // A cookie name is a short token: no whitespace, no '=', no ';'.
        expect(name, provider).toMatch(/^[A-Za-z0-9_.-]{2,40}$/);
        expect(name).not.toContain('=');
        expect(name).not.toContain(';');
      }
    }
  });

  it('exposes nothing shaped like a cookie value', () => {
    // Conduit never reads or stores a cookie value. A long unbroken token in
    // this module would mean a captured value had been pasted in as a fixture.
    const opaque = /[A-Za-z0-9+/=_-]{20,}/;
    for (const provider of [...WEB_PROVIDERS, 'not-a-provider' as ProviderName]) {
      for (const value of allStrings(authSignalsFor(provider))) {
        expect(value, `${provider}: ${value}`).not.toMatch(opaque);
      }
    }
  });
});

describe('decideAuthenticated — refusals', () => {
  it('refuses on a provider sign-in page, whichever signal catches it', () => {
    const pages: Array<[ProviderName, string, string, string]> = [
      // Product hosts are caught by the path…
      ['claude', 'claude.ai', '/login', 'sign-in path'],
      ['perplexity', 'www.perplexity.ai', '/signin', 'sign-in path'],
      // …dedicated sign-in hosts by the host itself.
      ['chatgpt', 'auth.openai.com', '/oauth/authorize', 'sign-in page'],
      ['gemini', 'accounts.google.com', '/signin/v2/identifier', 'sign-in page'],
      ['grok', 'accounts.x.ai', '/sign-in', 'sign-in page'],
    ];
    for (const [provider, host, path, reason] of pages) {
      const decision = decideAuthenticated(authSignalsFor(provider), observation({ host, path }));
      expect(decision.authenticated, provider).toBe(false);
      expect(decision.reason, provider).toContain(reason);
    }
  });

  it('refuses on a dedicated sign-in host whatever the path', () => {
    // The whole point of listing a host: a browser parked anywhere on
    // auth.openai.com is not a usable session, however stale cookies look.
    for (const path of ['/log-in', '/', '/authorize/resume', '/u/1/anything']) {
      const decision = decideAuthenticated(
        authSignalsFor('chatgpt'),
        observation({ host: 'auth.openai.com', path, hasSessionCookie: true, verifySelectorVisible: true }),
      );
      expect(decision.authenticated, path).toBe(false);
      expect(decision.reason, path).toContain('sign-in page');
    }
  });

  it('refuses on a sign-in path even when the host is the product host', () => {
    for (const path of ['/login', '/signin', '/sign-in', '/oauth/authorize', '/authenticate']) {
      const decision = decideAuthenticated(
        authSignalsFor('gemini'),
        observation({ host: 'gemini.google.com', path }),
      );
      expect(decision.authenticated, path).toBe(false);
      expect(decision.reason, path).toContain('sign-in path');
    }
  });

  it('normalizes host and path casing before judging', () => {
    const decision = decideAuthenticated(
      authSignalsFor('claude'),
      observation({ host: 'CLAUDE.AI', path: '/LOGIN' }),
    );
    expect(decision.authenticated).toBe(false);
  });

  it('refuses when a sign-in affordance is visible, even with a cookie and the verify selector', () => {
    // This is the regression that motivated the module: perplexity's textarea,
    // claude's editor shell and chatgpt's prompt box all render signed out, so
    // a visible sign-in button has to outrank both positive signals.
    for (const provider of ['perplexity', 'claude', 'chatgpt'] as ProviderName[]) {
      const decision = decideAuthenticated(
        authSignalsFor(provider),
        observation({
          host: `${provider}.example`,
          path: '/',
          hasSessionCookie: true,
          verifySelectorVisible: true,
          authedSelectorVisible: true,
          loggedOutSelectorVisible: true,
        }),
      );
      expect(decision.authenticated, provider).toBe(false);
      expect(decision.reason, provider).toContain('sign-in button');
    }
  });

  it('refuses when nothing at all is visible', () => {
    const decision = decideAuthenticated(authSignalsFor('grok'), observation({ host: 'grok.com', path: '/' }));
    expect(decision.authenticated).toBe(false);
    expect(decision.reason).toContain('did not load');
  });
});

describe('decideAuthenticated — acceptances', () => {
  it('accepts a session cookie when no logged-out signal is present', () => {
    const decision = decideAuthenticated(
      authSignalsFor('claude'),
      observation({ host: 'claude.ai', path: '/chats', hasSessionCookie: true }),
    );
    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toContain('cookie');
  });

  it('accepts a signed-in-only element without any cookie', () => {
    // No provider currently ships authedSelectors, but the branch has to hold:
    // it is the signal that survives a provider renaming its session cookie.
    const decision = decideAuthenticated(
      authSignalsFor('gemini'),
      observation({ host: 'gemini.google.com', path: '/app', authedSelectorVisible: true }),
    );
    expect(decision.authenticated).toBe(true);
  });

  it('accepts the verify selector alone as the weakest positive', () => {
    const decision = decideAuthenticated(
      authSignalsFor('perplexity'),
      observation({ host: 'www.perplexity.ai', path: '/', verifySelectorVisible: true }),
    );
    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toContain('no sign-in prompt');
  });
});

describe('decideAuthenticated — reasons', () => {
  it('explains every branch in plain language, with no selector syntax', () => {
    for (const obs of fullMatrix()) {
      expectHumanReadable(decideAuthenticated(authSignalsFor('claude'), obs).reason);
      expectHumanReadable(decideAuthenticated(authSignalsFor('not-a-provider' as ProviderName), obs).reason);
    }
  });

  it('gives each branch its own reason so the panel says which check fired', () => {
    // gemini's descriptor has both a dedicated sign-in host and the generic
    // path vocabulary, so every branch is reachable from one descriptor.
    const signals = authSignalsFor('gemini');
    const reasons = [
      observation({ host: 'accounts.google.com', path: '/' }),
      observation({ host: 'gemini.google.com', path: '/login' }),
      observation({ loggedOutSelectorVisible: true }),
      observation({ hasSessionCookie: true }),
      observation({ authedSelectorVisible: true }),
      observation({ verifySelectorVisible: true }),
      observation(),
    ].map(obs => decideAuthenticated(signals, obs).reason);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe('decideAuthenticated — conservatism', () => {
  it('never reports authenticated while a sign-in affordance is visible', () => {
    for (const provider of WEB_PROVIDERS) {
      const signals = authSignalsFor(provider);
      for (const obs of fullMatrix().filter(o => o.loggedOutSelectorVisible)) {
        const decision = decideAuthenticated(signals, obs);
        expect(decision.authenticated, `${provider} ${obs.host}${obs.path}`).toBe(false);
      }
    }
  });

  it('never reports authenticated while the browser sits on a sign-in path', () => {
    for (const provider of WEB_PROVIDERS) {
      const signals = authSignalsFor(provider);
      for (const obs of fullMatrix().filter(o => /login|signin/.test(o.path))) {
        expect(decideAuthenticated(signals, obs).authenticated, `${provider} ${obs.path}`).toBe(false);
      }
    }
  });

  it('treats a missing host and path as not authenticated rather than crashing', () => {
    const decision = decideAuthenticated(authSignalsFor('grok'), observation({ host: '', path: '' }));
    expect(decision.authenticated).toBe(false);
    expectHumanReadable(decision.reason);
  });

  it('is pure: the same observation always yields the same decision', () => {
    const obs = observation({ hasSessionCookie: true });
    const first = decideAuthenticated(authSignalsFor('claude'), obs);
    const second = decideAuthenticated(authSignalsFor('claude'), obs);
    expect(second).toEqual(first);
    expect(obs).toEqual(observation({ hasSessionCookie: true }));
  });
});

describe('decideAuthenticated — sign-in spellings', () => {
  it("recognises ChatGPT's /log-in spelling on a product host", () => {
    // The path vocabulary originally listed only 'login', so a browser parked
    // on the real sign-in page counted as signed in whenever a stale cookie
    // was present.
    for (const path of ['/log-in', '/log_in', '/login', '/sign-in']) {
      const decision = decideAuthenticated(
        authSignalsFor('chatgpt'),
        observation({ host: 'chatgpt.com', path, hasSessionCookie: true }),
      );
      expect(decision.authenticated, path).toBe(false);
    }
  });
});
