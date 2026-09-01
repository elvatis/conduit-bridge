// ── Per-provider "is this session actually signed in?" signals ───────────────
//
// The original `verifySelector` on each provider is not sufficient on its own:
// three of the five match elements that are present while signed OUT
// (perplexity's bare `textarea`, claude's `.ProseMirror` on the logged-out
// shell, chatgpt's `#prompt-textarea`). Treating those as "authenticated"
// produces a green provider that cannot actually answer a request.
//
// So authentication is decided from several observations at once:
//
//   not authenticated  if the page sits on a sign-in host, or a sign-in
//                      affordance is visible
//   authenticated      if neither of the above AND a session cookie exists
//                      for the origin OR an authenticated-only element is
//                      visible
//
// Cookie handling: only cookie NAMES are ever compared. Conduit never reads,
// stores, logs, transmits or returns a cookie value, and it never imports
// cookies from another browser.

import type { ProviderName } from '../types.js';

export interface AuthSignals {
  /**
   * Cookie names that only exist for a signed-in session on this provider.
   * Presence is a positive signal; absence is not conclusive (providers change
   * cookie names), so the selector signals still apply.
   */
  sessionCookieNames: readonly string[];
  /**
   * Hosts that exist ONLY to sign in. Landing on one means the session is not
   * usable, whatever the path. A product host that merely also serves a
   * sign-in page does not belong here — it is caught by the path check.
   */
  loginHostnames: readonly string[];
  /** Selectors that are only present once signed in. May be empty. */
  authedSelectors: readonly string[];
  /** Selectors that indicate a visible sign-in affordance (i.e. signed out). */
  loggedOutSelectors: readonly string[];
}

const NEXT_AUTH_SESSION = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
] as const;

const GENERIC_LOGGED_OUT = [
  'a[href*="/login" i]:visible',
  'button:has-text("Log in")',
  'button:has-text("Sign in")',
  'button:has-text("Sign up")',
  'a:has-text("Log in")',
  'a:has-text("Sign up")',
] as const;

const SIGNALS: Record<string, AuthSignals> = {
  claude: {
    sessionCookieNames: ['sessionKey', 'lastActiveOrg'],
    loginHostnames: [],
    authedSelectors: [],
    loggedOutSelectors: [...GENERIC_LOGGED_OUT, 'button:has-text("Continue with Google")', 'input[name="email"]'],
  },
  perplexity: {
    sessionCookieNames: [...NEXT_AUTH_SESSION, '__Secure-next-auth.session-token.0'],
    loginHostnames: [],
    authedSelectors: [],
    loggedOutSelectors: [...GENERIC_LOGGED_OUT, 'button:has-text("Continue with Google")', 'button:has-text("Continue with Apple")'],
  },
  chatgpt: {
    sessionCookieNames: [...NEXT_AUTH_SESSION],
    loginHostnames: ['auth.openai.com', 'auth0.openai.com'],
    authedSelectors: [],
    loggedOutSelectors: [...GENERIC_LOGGED_OUT, 'button[data-testid="login-button"]', 'button[data-testid="signup-button"]'],
  },
  gemini: {
    sessionCookieNames: ['__Secure-1PSID', '__Secure-3PSID', 'SID'],
    loginHostnames: ['accounts.google.com'],
    authedSelectors: [],
    loggedOutSelectors: ['a[href*="ServiceLogin" i]', 'a:has-text("Sign in")'],
  },
  grok: {
    sessionCookieNames: ['sso', 'sso-rw', 'auth_token'],
    loginHostnames: ['accounts.x.ai'],
    authedSelectors: [],
    loggedOutSelectors: [...GENERIC_LOGGED_OUT, 'button:has-text("Sign in with X")'],
  },
};

const FALLBACK: AuthSignals = {
  sessionCookieNames: [],
  loginHostnames: [],
  authedSelectors: [],
  loggedOutSelectors: [...GENERIC_LOGGED_OUT],
};

export function authSignalsFor(provider: ProviderName): AuthSignals {
  return SIGNALS[provider] ?? FALLBACK;
}

// ── Decision ─────────────────────────────────────────────────────────────────

/** Observations gathered from a live page + context, all booleans/strings. */
export interface AuthObservation {
  /** Hostname of the final URL. */
  host: string;
  /** Final URL path (no query string). */
  path: string;
  /** True when at least one configured session cookie NAME is present. */
  hasSessionCookie: boolean;
  /** True when the provider's own verifySelector is VISIBLE. */
  verifySelectorVisible: boolean;
  /** True when one of `authedSelectors` is visible. */
  authedSelectorVisible: boolean;
  /** True when a sign-in affordance is visible. */
  loggedOutSelectorVisible: boolean;
}

export interface AuthDecision {
  authenticated: boolean;
  /** Short, sanitized explanation suitable for the technical details panel. */
  reason: string;
}

/**
 * Decide whether an observation represents a signed-in session. Pure.
 *
 * Deliberately conservative: a false "authenticated" is worse than a false
 * "not authenticated", because it makes the provider look ready and then every
 * request fails.
 */
export function decideAuthenticated(
  signals: AuthSignals,
  obs: AuthObservation,
): AuthDecision {
  const host = (obs.host ?? '').toLowerCase();
  const path = (obs.path ?? '').toLowerCase();

  const onLoginHost = signals.loginHostnames.some(h => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
  // 'log-in' and 'log_in' are ChatGPT's real spelling; omitting them let a
  // browser parked on the sign-in page count as signed in.
  const onLoginPath = /(^|\/)(login|log-in|log_in|signin|sign-in|sign_in|authenticate|oauth|auth)(\/|$)/.test(path);
  if (onLoginHost) {
    return { authenticated: false, reason: 'the browser is on the provider sign-in page' };
  }
  if (onLoginPath) {
    return { authenticated: false, reason: 'the browser was redirected to a sign-in path' };
  }

  if (obs.loggedOutSelectorVisible) {
    return { authenticated: false, reason: 'the page still offers a sign-in button' };
  }

  if (obs.hasSessionCookie) {
    return { authenticated: true, reason: 'a provider session cookie is present for this profile' };
  }
  if (obs.authedSelectorVisible) {
    return { authenticated: true, reason: 'a signed-in-only element is visible' };
  }
  if (obs.verifySelectorVisible) {
    return { authenticated: true, reason: 'the provider interface is loaded and no sign-in prompt is shown' };
  }

  return { authenticated: false, reason: 'the provider interface did not load for this profile' };
}
