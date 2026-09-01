// ── Login session manager ────────────────────────────────────────────────────
//
// Owns one interactive login attempt per provider: drives the state machine,
// enforces the time budgets, serialises attempts, and publishes every
// transition so the dashboard can show live status instead of polling.
//
// The manager never touches a browser directly. It talks to a `LoginDriver`,
// which the provider implements, so the whole machine is testable with a fake
// driver and no Chromium.

import { randomUUID } from 'node:crypto';
import type { ProviderName } from '../types.js';
import type { ChallengeVerdict } from './challenge.js';
import { copyFor } from './copy.js';
import {
  applyTransition,
  isTerminalLoginState,
  newLoginSnapshot,
  resolveLoginTimings,
  type LoginDiagnostics,
  type LoginMode,
  type LoginSnapshot,
  type LoginState,
  type LoginTimings,
} from './state.js';

export interface LoginBrowserObservation {
  alive: boolean;
  verdict: ChallengeVerdict;
  titleAvailable: boolean;
}

export interface LoginVerification {
  authenticated: boolean;
  verdict: ChallengeVerdict;
  diagnostics: LoginDiagnostics;
}

/** What the manager needs a provider to be able to do. */
export interface LoginDriver {
  readonly name: ProviderName;
  readonly loginUrl: string;
  /** Opens a visible browser for the person. Rejects when it cannot. */
  openLoginBrowser(): Promise<{ viewerUrl: string | null; diagnostics: LoginDiagnostics }>;
  /** Observes the visible browser without automating it. */
  observeLoginBrowser(): Promise<LoginBrowserObservation>;
  /** Closes the visible browser and releases the profile. */
  closeLoginBrowser(): Promise<void>;
  /** Authoritative session check against the saved profile. */
  verifySession(): Promise<LoginVerification>;
  /**
   * Optional: told when the attempt is cancelled, so a long-running check can
   * give up promptly instead of holding shutdown open.
   */
  onCancel?(): void;
}

export interface LoginSessionManagerOptions {
  onTransition: (snapshot: LoginSnapshot) => void;
  timings?: Partial<LoginTimings>;
  mode?: LoginMode;
  /** Overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  newId?: () => string;
}

export class DuplicateLoginError extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`A login for ${provider} is already in progress.`);
    this.name = 'DuplicateLoginError';
  }
}

interface ActiveSession {
  snapshot: LoginSnapshot;
  driver: LoginDriver;
  abort: AbortController;
  recheckRequested: boolean;
  done: Promise<LoginSnapshot>;
  /** When the current interstitial was first observed. */
  interstitialSince: number | null;
}

export class LoginSessionManager {
  private readonly _active = new Map<ProviderName, ActiveSession>();
  private readonly _last = new Map<ProviderName, LoginSnapshot>();
  private readonly _timings: LoginTimings;
  private readonly _sleep: (ms: number) => Promise<void>;
  private readonly _now: () => number;
  private readonly _newId: () => string;
  private readonly _mode: LoginMode;

  constructor(private readonly _opts: LoginSessionManagerOptions) {
    this._timings = resolveLoginTimings(_opts.timings);
    this._sleep = _opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    this._now = _opts.now ?? Date.now;
    this._newId = _opts.newId ?? (() => randomUUID());
    this._mode = _opts.mode ?? 'handoff';
  }

  active(provider: ProviderName): boolean {
    return this._active.has(provider);
  }

  /** Latest snapshot for a provider — live if one is running, else the last one. */
  snapshot(provider: ProviderName): LoginSnapshot | undefined {
    return this._active.get(provider)?.snapshot ?? this._last.get(provider);
  }

  list(): LoginSnapshot[] {
    const out = new Map<ProviderName, LoginSnapshot>(this._last);
    for (const [name, session] of this._active) out.set(name, session.snapshot);
    return [...out.values()];
  }

  /**
   * Drops a completed attempt once a newer provider check proves that the
   * saved browser session is valid. A live attempt is never removed.
   */
  forgetFinished(provider: ProviderName, sessionId?: string): boolean {
    if (this._active.has(provider)) return false;
    const snapshot = this._last.get(provider);
    if (!snapshot || (sessionId && snapshot.sessionId !== sessionId)) return false;
    return this._last.delete(provider);
  }

  /** Starts an attempt. Throws DuplicateLoginError when one is already running. */
  start(driver: LoginDriver): LoginSnapshot {
    if (this._active.has(driver.name)) throw new DuplicateLoginError(driver.name);

    const copy = copyFor(driver.name, 'starting');
    const snapshot: LoginSnapshot = {
      ...newLoginSnapshot(driver.name, this._newId(), copy.message, this._now()),
      nextAction: copy.nextAction,
      actions: copy.actions,
      loginUrl: driver.loginUrl,
      diagnostics: { browserMode: this._mode },
    };

    const session: ActiveSession = {
      snapshot,
      driver,
      abort: new AbortController(),
      recheckRequested: false,
      interstitialSince: null,
      done: Promise.resolve(snapshot),
    };
    this._active.set(driver.name, session);
    this._emit(session);

    session.done = this._run(session).finally(() => {
      this._last.set(driver.name, session.snapshot);
      this._active.delete(driver.name);
    });
    // The loop reports through onTransition; a rejection here would be an
    // internal bug, so keep it from becoming an unhandled rejection.
    session.done.catch(() => {});
    return snapshot;
  }

  /** Asks the running attempt to verify now. No-op when nothing is running. */
  recheck(provider: ProviderName): LoginSnapshot | undefined {
    const session = this._active.get(provider);
    if (!session) return this._last.get(provider);
    session.recheckRequested = true;
    return session.snapshot;
  }

  /**
   * Cancels the running attempt and waits for its cleanup.
   *
   * The wait is bounded: a driver parked in a browser call must not be able to
   * hold a shutdown open, and the state is already `cancelled` either way.
   */
  async cancel(provider: ProviderName, reason = 'cancelled by the user'): Promise<LoginSnapshot | undefined> {
    const session = this._active.get(provider);
    if (!session) return this._last.get(provider);
    // Set the state first so the browser teardown is never reported as a failure.
    this._transition(session, 'cancelled', { diagnostics: { reason } });
    session.abort.abort();
    try { session.driver.onCancel?.(); } catch { /* best effort */ }
    // Safe to await: every driver call inside the loop races the abort signal,
    // so a driver parked in a browser call cannot hold this open.
    await session.done.catch(() => {});
    return this._last.get(provider) ?? session.snapshot;
  }

  /** Cancels every running attempt. Called on server shutdown. */
  async stopAll(): Promise<void> {
    await Promise.all([...this._active.keys()].map(name => this.cancel(name, 'the bridge is shutting down')));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _emit(session: ActiveSession): void {
    try {
      this._opts.onTransition(session.snapshot);
    } catch {
      // A broken subscriber must never break a login.
    }
  }

  private _transition(
    session: ActiveSession,
    to: LoginState,
    patch: Partial<LoginSnapshot> = {},
  ): boolean {
    const prev = session.snapshot;
    if (isTerminalLoginState(prev.state)) return false;
    const merged: Partial<LoginSnapshot> = { ...patch };
    const diagnostics = { ...(prev.diagnostics ?? {}), ...(patch.diagnostics ?? {}) };
    if (prev.state !== to) {
      const copy = copyFor(session.driver.name, to, diagnostics);
      merged.message = patch.message ?? copy.message;
      merged.nextAction = patch.nextAction ?? copy.nextAction;
      merged.actions = copy.actions;
    }
    const next = applyTransition(prev, to, merged, this._now());
    if (next === prev) return false;
    session.snapshot = next;
    // Only publish when something a reader would notice actually changed.
    // The poll loop re-asserts the current state every tick, and broadcasting
    // that would make every connected dashboard re-render once a second.
    if (meaningfullyDifferent(prev, next)) this._emit(session);
    return true;
  }

  private _cancelled(session: ActiveSession): boolean {
    return session.abort.signal.aborted || session.snapshot.state === 'cancelled';
  }

  /**
   * Await a driver call, but give up as soon as the attempt is cancelled.
   *
   * Without this, a driver parked in a browser call would keep `session.done`
   * pending, and `stopAll()` — which runs during server shutdown — would wait
   * on it forever.
   */
  private _untilAbort<T>(session: ActiveSession, work: Promise<T>, onAbort: T): Promise<T> {
    if (this._cancelled(session)) return Promise.resolve(onAbort);
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (value: T) => {
        if (settled) return;
        settled = true;
        session.abort.signal.removeEventListener('abort', abortListener);
        resolve(value);
      };
      const abortListener = () => finish(onAbort);
      session.abort.signal.addEventListener('abort', abortListener, { once: true });
      // A rejection still propagates: only an abort substitutes the fallback,
      // so a browser that will not launch is still reported as failed.
      work.then(finish, err => {
        if (settled) return;
        settled = true;
        session.abort.signal.removeEventListener('abort', abortListener);
        reject(err);
      });
    });
  }

  private async _run(session: ActiveSession): Promise<LoginSnapshot> {
    const t = this._timings;
    let browserOpen = false;
    try {
      const opened = await this._untilAbort(session, session.driver.openLoginBrowser(), null);
      if (this._cancelled(session) || !opened) return session.snapshot;
      browserOpen = true;
      this._transition(session, 'browser_ready', {
        viewerUrl: opened.viewerUrl ?? undefined,
        diagnostics: opened.diagnostics,
      });

      while (!this._cancelled(session)) {
        if (this._now() - session.snapshot.startedAt >= t.hardTimeoutMs) {
          // Check once before giving up: a sign-in completed near the deadline
          // should be reported as success, not as a timeout.
          const outcome = await this._verify(session, true);
          browserOpen = outcome === 'reopened';
          if (outcome === 'done' || isTerminalLoginState(session.snapshot.state)) break;
          this._transition(session, 'timeout', { diagnostics: { reason: 'no sign-in was completed within the time limit' } });
          break;
        }

        const takeRecheck = session.recheckRequested;
        session.recheckRequested = false;

        // An observation failure means "we cannot see the browser", which the
        // loop already handles as "verify now" — it is not a login failure.
        const idle: LoginBrowserObservation = { alive: false, verdict: { verdict: 'ok' }, titleAvailable: false };
        const observation = await this._untilAbort(
          session,
          session.driver.observeLoginBrowser().catch(() => idle),
          idle,
        );

        if (this._cancelled(session)) break;

        // The person closed the window, or asked for a check: verify now.
        if (!observation.alive || takeRecheck) {
          const outcome = await this._verify(session, observation.alive);
          // _verify closes the browser itself and reopens it only when the
          // person still has something to do, so this is the authoritative
          // answer for the finally block.
          browserOpen = outcome === 'reopened';
          if (outcome === 'done') break;
          if (this._cancelled(session)) break;
          continue;
        }

        this._applyObservation(session, observation);
        if (isTerminalLoginState(session.snapshot.state)) break;

        await this._sleep(t.pollIntervalMs);
      }
    } catch (err) {
      if (!this._cancelled(session)) {
        this._transition(session, 'failed', {
          diagnostics: { reason: sanitize(err) },
        });
      }
    } finally {
      // Awaited unbounded on purpose: this is the cleanup that releases the
      // profile directory, and every driver's close is itself bounded (the
      // handoff browser escalates to SIGKILL and gives the lock a deadline).
      if (browserOpen || session.snapshot.state === 'cancelled') {
        await session.driver.closeLoginBrowser().catch(() => {});
      }
    }
    return session.snapshot;
  }

  /** Folds a live observation of the visible browser into the state. */
  private _applyObservation(session: ActiveSession, observation: LoginBrowserObservation): void {
    const t = this._timings;
    const { verdict } = observation;

    if (verdict.verdict === 'blocked') {
      this._transition(session, 'blocked', {
        diagnostics: { challengeKind: verdict.kind, reason: verdict.signal, rayId: verdict.rayId },
      });
      return;
    }

    if (verdict.verdict === 'verifying' || verdict.verdict === 'challenge_detected') {
      if (session.interstitialSince === null) session.interstitialSince = this._now();
      const stuckFor = this._now() - session.interstitialSince;

      const announce = verdict.verdict === 'challenge_detected' || stuckFor >= t.challengeAnnounceMs;
      if (announce) {
        // A check that has been up a long time is reported more bluntly, but
        // the attempt stays open: the person may still be completing it, and
        // ending it here would close the very window they are working in. Only
        // an actual refusal, a cancel or the overall budget ends an attempt.
        const stuck = stuckFor >= t.stuckMs;
        this._transition(session, 'challenge_detected', {
          nextAction: stuck
            ? `Complete the security check in the login browser, then choose "Check login status". If it has not asked you for anything, the provider is not letting this connection through — cancel and use an api-* or cli-* transport instead.`
            : undefined,
          diagnostics: {
            challengeKind: verdict.kind,
            // A widget was really seen only when the page observation itself
            // said so — a visible challenge iframe yields BOTH of these. A
            // header-only signal means a spinner, and claiming otherwise sends
            // the person looking for a checkbox that is not there.
            widgetVisible: verdict.verdict === 'challenge_detected' && verdict.kind === 'cloudflare_interactive',
            rayId: verdict.rayId,
            ...(stuck ? { reason: 'the security check has been running for a long time' } : {}),
          },
        });
      } else if (stuckFor >= t.verifyingGraceMs) {
        this._transition(session, 'verifying', { diagnostics: { challengeKind: verdict.kind } });
      }
      return;
    }

    session.interstitialSince = null;
    this._transition(session, 'waiting_for_user', {
      diagnostics: observation.titleAvailable ? {} : { reason: undefined },
    });
  }

  /**
   * Closes the visible browser, checks the saved profile, and decides whether
   * the attempt is finished. Returns 'done' for a terminal state, 'reopened'
   * when the browser was brought back for the person, or 'closed'.
   */
  private async _verify(session: ActiveSession, _browserWasOpen: boolean): Promise<'done' | 'reopened' | 'closed'> {
    this._transition(session, 'verifying');
    // Always close, even when the browser is already gone: the driver's close
    // is what releases the provider's own login flag and the profile lock, and
    // skipping it left the provider frozen for the rest of the process.
    await this._untilAbort(session, session.driver.closeLoginBrowser().catch(() => {}), undefined);
    if (this._cancelled(session)) return 'closed';

    const unknown: LoginVerification = {
      authenticated: false,
      verdict: { verdict: 'ok' },
      diagnostics: { reason: 'the session check did not complete' },
    };
    const result = await this._untilAbort(
      session,
      session.driver.verifySession().catch(err => ({
        authenticated: false,
        verdict: { verdict: 'ok' } as ChallengeVerdict,
        diagnostics: { reason: sanitize(err) },
      })),
      unknown,
    );
    if (this._cancelled(session)) return 'closed';

    if (result.authenticated) {
      this._transition(session, 'authenticated', { diagnostics: result.diagnostics });
      return 'done';
    }

    if (result.verdict.verdict === 'blocked') {
      this._transition(session, 'blocked', {
        diagnostics: { ...result.diagnostics, challengeKind: result.verdict.kind, rayId: result.verdict.rayId, reason: result.verdict.signal },
      });
      return 'done';
    }

    // Not signed in yet. Bring the browser back so the person can continue —
    // including completing a security check themselves.
    const challenged = result.verdict.verdict !== 'ok';
    let reopened = false;
    try {
      const opened = await this._untilAbort(session, session.driver.openLoginBrowser(), null);
      if (this._cancelled(session)) return 'closed';
      if (!opened) throw new Error('the login browser could not be reopened');
      reopened = true;
      this._transition(session, challenged ? 'challenge_detected' : 'waiting_for_user', {
        viewerUrl: opened.viewerUrl ?? undefined,
        diagnostics: {
          ...result.diagnostics,
          ...opened.diagnostics,
          challengeKind: result.verdict.kind,
          rayId: result.verdict.rayId,
        },
      });
    } catch (err) {
      this._transition(session, 'failed', { diagnostics: { ...result.diagnostics, reason: sanitize(err) } });
      return 'done';
    }
    session.interstitialSince = challenged ? this._now() : null;
    return reopened ? 'reopened' : 'closed';
  }
}

/**
 * Whether two snapshots differ in anything a person or a dashboard would see.
 * Timestamps alone do not count.
 */
function meaningfullyDifferent(a: LoginSnapshot, b: LoginSnapshot): boolean {
  return a.state !== b.state
    || a.message !== b.message
    || a.nextAction !== b.nextAction
    || a.viewerUrl !== b.viewerUrl
    || JSON.stringify(a.diagnostics ?? {}) !== JSON.stringify(b.diagnostics ?? {});
}

/** Collapses an error into one short, credential-free line. */
export function sanitize(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'unknown error');
  return raw
    // Drop query strings AND fragments: an implicit-flow OAuth callback carries
    // its access token in the fragment.
    .replace(/[?#][^\s]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
