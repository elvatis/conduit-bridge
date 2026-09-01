// ── Browser-login state machine (pure) ───────────────────────────────────────
//
// This module is deliberately free of Playwright, node:child_process and any
// I/O so the whole machine can be unit-tested without launching a browser.
// Everything time-dependent is injected through `LoginTimings`.
//
// Scope note: Conduit detects provider security challenges so it can explain
// them and hand control to the human. It never solves, bypasses or suppresses
// one. See src/login/challenge.ts.

import type { ProviderName } from '../types.js';

/**
 * The lifecycle of one interactive browser login.
 *
 * starting            preparing the browser session (profile lock, display probe)
 * browser_ready       a visible browser is up on the graphical session
 * waiting_for_user    the person is expected to sign in themselves
 * verifying           Conduit is checking whether the sign-in took
 * authenticated       verified good; the profile is saved for attached restore
 * challenge_detected  the provider is showing a security check the person must complete
 * blocked             the provider refused this browser/network outright
 * timeout             nothing conclusive happened within the budget
 * failed              something went wrong (browser launch, display, unexpected error)
 * cancelled           the person (or a shutdown) stopped the attempt
 */
export type LoginState =
  | 'starting'
  | 'browser_ready'
  | 'waiting_for_user'
  | 'verifying'
  | 'authenticated'
  | 'challenge_detected'
  | 'blocked'
  | 'timeout'
  | 'failed'
  | 'cancelled';

export const LOGIN_STATES: readonly LoginState[] = [
  'starting', 'browser_ready', 'waiting_for_user', 'verifying',
  'authenticated', 'challenge_detected', 'blocked', 'timeout', 'failed', 'cancelled',
];

/** States after which no further transition happens; the session is done. */
export const TERMINAL_LOGIN_STATES: ReadonlySet<LoginState> = new Set<LoginState>([
  'authenticated', 'blocked', 'timeout', 'failed', 'cancelled',
]);

export function isTerminalLoginState(state: LoginState): boolean {
  return TERMINAL_LOGIN_STATES.has(state);
}

/**
 * Legal transitions. `challenge_detected` is intentionally NOT terminal: the
 * person can complete the check in the visible browser and Conduit re-verifies.
 */
const TRANSITIONS: Record<LoginState, readonly LoginState[]> = {
  starting:           ['browser_ready', 'verifying', 'authenticated', 'blocked', 'failed', 'cancelled', 'timeout'],
  browser_ready:      ['waiting_for_user', 'verifying', 'challenge_detected', 'blocked', 'failed', 'cancelled', 'timeout'],
  waiting_for_user:   ['verifying', 'challenge_detected', 'blocked', 'failed', 'cancelled', 'timeout', 'browser_ready'],
  verifying:          ['authenticated', 'waiting_for_user', 'challenge_detected', 'blocked', 'failed', 'cancelled', 'timeout'],
  challenge_detected: ['verifying', 'waiting_for_user', 'authenticated', 'blocked', 'failed', 'cancelled', 'timeout'],
  authenticated:      [],
  blocked:            [],
  timeout:            [],
  failed:             [],
  cancelled:          [],
};

export function canTransition(from: LoginState, to: LoginState): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/** The states a person can act on from the dashboard. */
export function isActionableLoginState(state: LoginState): boolean {
  return state === 'waiting_for_user' || state === 'challenge_detected' || state === 'browser_ready';
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export type ChallengeKind =
  | 'cloudflare_managed'        // interstitial that may clear on its own
  | 'cloudflare_interactive'    // a widget the person must click
  | 'cloudflare_block'          // hard refusal (error 1006/1015/1020 family)
  | 'google_untrusted_browser'  // Google refuses sign-in from automated browsers
  | 'unknown';

/**
 * Everything technical the dashboard hides behind "Technical details".
 * Nothing here may contain a cookie, token, password or query string.
 */
export interface LoginDiagnostics {
  /** Final URL with the query string removed. */
  finalUrl?: string;
  pageTitle?: string;
  httpStatus?: number;
  /** Cloudflare ray id — an opaque support reference, safe to show. */
  rayId?: string;
  challengeKind?: ChallengeKind;
  /** True when an interactive challenge widget was actually visible. */
  widgetVisible?: boolean;
  /** How the login browser was launched. */
  browserMode?: LoginMode;
  /** Whether the graphical rendering session checked out. */
  displayOk?: boolean;
  windowManager?: boolean;
  /** Set when the login and restore browser identities differ (see config). */
  identityMismatch?: boolean;
  /** Sanitized one-line reason for a non-happy terminal state. */
  reason?: string;
}

/** How the visible login browser is launched. */
export type LoginMode =
  /** Ordinary Chromium attached after launch for the built-in viewer. */
  | 'handoff'
  /** A Playwright-driven browser. Richer diagnostics, but discloses automation. */
  | 'assisted';

export interface LoginSnapshot {
  provider: ProviderName;
  /** Identifies one attempt; changes on every start. */
  sessionId: string;
  state: LoginState;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  /** The page the person is expected to sign in on. */
  loginUrl?: string;
  /** Plain-language status line. */
  message: string;
  /** Plain-language next step, or undefined when nothing is required. */
  nextAction?: string;
  /** Where the visible browser can be reached, when one is running. */
  viewerUrl?: string;
  /**
   * The controls that make sense in this state, in order. Carried on the
   * snapshot so the dashboard does not have to re-derive them and drift — it
   * used to offer "Check login status" while a check was already running,
   * which would have closed the browser the person was told to use.
   */
  actions?: readonly string[];
  diagnostics?: LoginDiagnostics;
}

// ── Timings ──────────────────────────────────────────────────────────────────

/**
 * All time budgets, injected so tests need neither fake timers nor real waits.
 * Defaults are anchored on Cloudflare's documented "typically less than five
 * seconds" for a managed challenge and on the observed non-resolution beyond
 * a minute.
 */
export interface LoginTimings {
  /** Grace period before a spinning interstitial is reported to the person. */
  verifyingGraceMs: number;
  /** Still interstitial after this -> challenge_detected. */
  challengeAnnounceMs: number;
  /** Still interstitial after this -> the blunter "not letting us through" wording. */
  stuckMs: number;
  /** Overall budget for one attempt -> timeout. */
  hardTimeoutMs: number;
  /** How often the observer samples the browser. */
  pollIntervalMs: number;
  /** How long to wait for the browser to exit before escalating the signal. */
  browserCloseMs: number;
  /** How long to wait for the profile lock to be released after a close. */
  profileReleaseMs: number;
}

export const DEFAULT_LOGIN_TIMINGS: LoginTimings = {
  verifyingGraceMs: 8_000,
  challengeAnnounceMs: 15_000,
  stuckMs: 45_000,
  hardTimeoutMs: 300_000,
  pollIntervalMs: 1_000,
  browserCloseMs: 10_000,
  profileReleaseMs: 15_000,
};

export function resolveLoginTimings(overrides?: Partial<LoginTimings>): LoginTimings {
  return { ...DEFAULT_LOGIN_TIMINGS, ...(overrides ?? {}) };
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────

/**
 * Merge a transition into a snapshot. Returns the previous snapshot unchanged
 * when the transition is illegal, so a caller can detect a no-op by identity.
 */
export function applyTransition(
  prev: LoginSnapshot,
  to: LoginState,
  patch: Partial<Omit<LoginSnapshot, 'provider' | 'sessionId' | 'state' | 'startedAt'>> = {},
  now: number = Date.now(),
): LoginSnapshot {
  // A same-state update (refreshing diagnostics while waiting) is allowed, but
  // never once the attempt has finished.
  if (prev.state === to ? isTerminalLoginState(to) : !canTransition(prev.state, to)) return prev;
  const diagnostics = patch.diagnostics
    ? { ...(prev.diagnostics ?? {}), ...patch.diagnostics }
    : prev.diagnostics;
  return {
    ...prev,
    ...patch,
    diagnostics,
    state: to,
    updatedAt: now,
    elapsedMs: Math.max(0, now - prev.startedAt),
  };
}

export function newLoginSnapshot(
  provider: ProviderName,
  sessionId: string,
  message: string,
  now: number = Date.now(),
): LoginSnapshot {
  return {
    provider,
    sessionId,
    state: 'starting',
    startedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    message,
  };
}
