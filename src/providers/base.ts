import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter, SessionInfo, SessionStatus } from '../types.js';
import { profileDir } from '../config.js';
import { logger } from '../logger.js';
import { NetworkCapture, type InterceptSpec } from './interception.js';
import {
  ChallengeWatcher, classifyDom, classifyResponse, evaluateChallengeMarkers,
  mergeVerdicts, type ChallengeVerdict, type ObservablePage,
} from '../login/challenge.js';
import { authSignalsFor, decideAuthenticated } from '../login/auth-signals.js';
import { probeDisplay, type DisplayProbe } from '../login/display.js';
import { removeStaleProfileLocks } from '../login/handoff.js';
import { launchAttachedRestoreBrowser, type AttachedRestoreBrowser } from '../login/restore-browser.js';
import { loginViewerUrl, type LoginViewerInput } from '../login/viewer.js';
import { sanitize, type LoginBrowserObservation, type LoginDriver, type LoginVerification } from '../login/session-manager.js';
import { restoreFailureCopy } from '../login/copy.js';
import type { LoginDiagnostics, LoginMode, LoginSnapshot } from '../login/state.js';

// Compatibility export for embedders that still inspect the old launch helper.
// The built-in restore path now uses restore-browser.ts and does not ask
// Playwright to launch the browser.
const RESTORE_PROCESS_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
];

/** True when the caller opted out of the Chromium OS sandbox. */
export function sandboxOptedOut(cfg: BridgeConfig): boolean {
  return cfg.chromiumNoSandbox === true || process.env.CONDUIT_NO_SANDBOX === '1';
}

/**
 * Resolve compatibility Chromium arguments for external embedders.
 *
 * Note on the sandbox: Playwright appends '--no-sandbox' itself unless the
 * launch is given `chromiumSandbox: true`, so passing the flag here is only
 * about making the opt-in explicit. `resolveSandboxOption` carries the real
 * decision to the launch call.
 */
export function resolveLaunchArgs(cfg: BridgeConfig): string[] {
  return sandboxOptedOut(cfg) ? [...RESTORE_PROCESS_ARGS, '--no-sandbox'] : [...RESTORE_PROCESS_ARGS];
}

/** Whether Playwright should keep the Chromium OS sandbox enabled. */
export function resolveSandboxOption(cfg: BridgeConfig): boolean {
  return !sandboxOptedOut(cfg);
}

/**
 * Compatibility context options. The active restore context is obtained from
 * an already-running browser and therefore uses its native identity.
 */
export function restoreContextOptions(cfg: BridgeConfig): Record<string, unknown> {
  void cfg;
  return { viewport: null };
}

/**
 * Context options for a Playwright-driven manual login ('assisted' mode).
 *
 * No User-Agent override and no fixed viewport: the browser reports itself
 * accurately and uses the real window size. Nothing here disguises the browser.
 */
export function manualLoginContextOptions(_cfg: BridgeConfig): Record<string, unknown> {
  return { viewport: null };
}

/** Launch args for a Playwright-driven manual login. Deliberately empty. */
export function manualLoginPlaywrightArgs(cfg: BridgeConfig): string[] {
  return sandboxOptedOut(cfg) ? ['--no-sandbox'] : [];
}

/** True when restore and manual login present different browser identities. */
export function identitiesDiffer(cfg: BridgeConfig): boolean {
  void cfg;
  return false;
}

export abstract class BaseProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly models: ModelDefinition[];
  abstract readonly loginUrl: string;
  abstract readonly verifySelector: string;

  protected _ctx: BrowserContext | null = null;
  protected _browser: Browser | null = null;
  private _restoreBrowser: AttachedRestoreBrowser | null = null;
  protected readonly _cfg: BridgeConfig;
  private _restoring = false;
  private _loginInProgress = false;

  // ── Interactive login ────────────────────────────────────────────────────
  /** Ordinary headed Chromium attached after launch for the built-in viewer. */
  private _loginBrowser: AttachedRestoreBrowser | null = null;
  /** A Playwright-driven login context, used only in 'assisted' mode. */
  private _assistedCtx: BrowserContext | null = null;
  /** Most recent security-check observation, for diagnostics. */
  private _lastChallenge: ChallengeVerdict = { verdict: 'ok' };
  /** Technical detail about the last unsuccessful restore or login. */
  private _challengeDiagnostics: LoginDiagnostics = {};
  /** Warn once per process rather than on every launch. */
  private static _sandboxWarned = false;

  // ── Session expiry tracking (T-004) ──────────────────────────────────────
  /** True when the last verification found a logged-in session. */
  protected _loggedIn = false;
  /** Epoch ms of the last verified-good login, or null if never verified. */
  protected _lastVerified: number | null = null;
  /** active = valid, expired = lapsed after a good login, unknown = not seen yet. */
  protected _sessionStatus: SessionStatus = 'unknown';

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
  }

  get profileDir(): string {
    return profileDir(this._cfg, this.name);
  }

  get hasProfile(): boolean {
    return existsSync(this.profileDir);
  }

  // ── Session management ────────────────────────────────────────────────────

  async checkSession(): Promise<boolean> {
    // A visible login browser owns the profile; the headless context is closed
    // and reporting on it would only produce a misleading 'expired'.
    if (this._loginInProgress) return this._loggedIn;
    if (!this._ctx) return this._recordSession(false, null);
    try {
      this._ctx.pages(); // throws if context is closed
      const page = this._ctx.pages()[0];
      if (!page) return this._recordSession(false, null);
      let visible = await page.locator(this.verifySelector).isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) visible = await page.locator(this.verifySelector).first()
        .waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
      const decision = await this._decideAuthenticated(page, this._ctx, visible);
      return this._recordSession(decision.authenticated, page.url());
    } catch {
      await this._closeRestoreContext();
      return this._recordSession(false, null);
    }
  }

  /**
   * Ensure the provider is connected. If not, attempt to restore the session.
   * Returns true if connected (either already or after restore).
   */
  async ensureConnected(): Promise<boolean> {
    if (await this.checkSession()) return true;
    if (!this.hasProfile) return false;
    return this.restoreSession();
  }

  async restoreSession(): Promise<boolean> {
    // Prevent concurrent restore attempts
    if (this._restoring) {
      logger.debug(`[${this.name}] restore already in progress — waiting…`);
      // Wait for the current restore to finish (up to 60s)
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!this._restoring) return this._ctx !== null;
      }
      return false;
    }

    if (!this.hasProfile) {
      logger.debug(`[${this.name}] no profile — skipping restore`);
      return false;
    }

    this._restoring = true;
    try {
      const ok = await this._restoreWithRetry();
      if (ok) this._markVerified();
      return ok;
    } finally {
      this._restoring = false;
    }
  }

  private async _restoreWithRetry(): Promise<boolean> {
    const maxAttempts = 3;
    const delays = [0, 3000, 8000]; // backoff: immediate, 3s, 8s

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        logger.info(`[${this.name}] retry ${attempt}/${maxAttempts - 1} in ${delays[attempt] / 1000}s…`);
        await new Promise(r => setTimeout(r, delays[attempt]));
      }

      // If a login browser is open (user is actively logging in), don't interfere
      if (this._loginInProgress) {
        logger.info(`[${this.name}] login in progress — skipping restore`);
        return false;
      }

      logger.info(`[${this.name}] restoring session from profile (attempt ${attempt + 1})…`);
      const result = await this._attemptRestore();
      if (result.authenticated) return true;

      // A provider security check makes every selector meaningless, and
      // retrying into one can extend a block. Stop and report instead.
      if (result.verdict.verdict === 'blocked' || result.verdict.verdict === 'challenge_detected') {
        const state = result.verdict.verdict === 'blocked' ? 'blocked' : 'challenge_detected';
        logger.info(`[${this.name}] ${restoreFailureCopy(this.name, state, result.diagnostics)}`);
        return false;
      }
      logger.info(`[${this.name}] not signed in on attempt ${attempt + 1}: ${result.diagnostics.reason ?? 'unknown reason'}`);
    }

    logger.info(`[${this.name}] profile exists but not logged in — all attempts exhausted`);
    return false;
  }

  /**
   * One headless pass over the saved profile: navigate, observe whether a
   * provider security check is in the way, and decide whether the session is
   * genuinely signed in.
   *
   * On success the context is kept as the provider's live context. On any
   * other outcome the context is closed, so a failed attempt never leaves a
   * Chromium holding the profile directory open.
   */
  private async _attemptRestore(opts: { autoAcceptConsent?: boolean } = {}): Promise<LoginVerification> {
    const autoAcceptConsent = opts.autoAcceptConsent !== false;
    // Close any stale context first because Chromium cannot open one profile twice.
    await this._closeRestoreContext();

    let watcher: ChallengeWatcher | null = null;
    const fail = async (verdict: ChallengeVerdict, diagnostics: LoginDiagnostics): Promise<LoginVerification> => {
      this._lastChallenge = verdict;
      this._challengeDiagnostics = diagnostics;
      await this._closeRestoreContext();
      return { authenticated: false, verdict, diagnostics };
    };

    try {
      mkdirSync(this.profileDir, { recursive: true });
      this._ctx = await this._launchRestoreContext();

      const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
      watcher = new ChallengeWatcher(page as unknown as ObservablePage);

      // Navigate with generous timeout
      let navVerdict: ChallengeVerdict = { verdict: 'ok' };
      const response = await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // The top-level document: a refusal here really does mean the page could
      // not be reached.
      if (response) navVerdict = classifyResponse(response.status(), response.headers(), { isDocument: true });

      // Wait for the page to settle - try networkidle first, fall back to a delay
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

      // Handle Google consent dialogs (common for Gemini and other Google services)
      let _onConsentPage = false;
      try { const _p = new URL(page.url()); _onConsentPage = _p.hostname === 'consent.google.com'; } catch { _onConsentPage = false; }
      if (_onConsentPage && autoAcceptConsent) {
        logger.debug(`[${this.name}] consent dialog detected, auto-accepting...`);
        const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Alle akzeptieren"), button:has-text("I agree"), button:has-text("Akzeptieren")').first();
        if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await acceptBtn.click();
          await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        }
      }

      // Give SPAs extra time to render (React/Vue hydration)
      await new Promise(r => setTimeout(r, 5000));

      const base: LoginDiagnostics = {
        finalUrl: stripQuery(page.url()),
        pageTitle: await page.title().catch(() => undefined),
        httpStatus: response?.status(),
        identityMismatch: identitiesDiffer(this._cfg),
      };

      const challenge = mergeVerdicts(navVerdict, watcher.verdict, await this._domVerdict(page));
      if (challenge.verdict === 'blocked' || challenge.verdict === 'challenge_detected') {
        return await fail(challenge, {
          ...base,
          challengeKind: challenge.kind,
          rayId: challenge.rayId,
          reason: challenge.signal,
        });
      }

      // Check for the verify selector with a generous timeout
      let visible = await page.locator(this.verifySelector).isVisible({ timeout: 30000 }).catch(() => false);
      if (!visible) {
        // The element can exist while still being laid out. Wait for it to
        // become visible rather than accepting a hidden match, which an
        // interstitial page also satisfies.
        const count = await page.locator(this.verifySelector).count().catch(() => 0);
        if (count > 0) {
          logger.debug(`[${this.name}] selector exists (${count} elements) but not visible — waiting`);
          visible = await page.locator(this.verifySelector).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        }
      }
      if (!visible) {
        // Nudge lazy-loading interfaces once.
        await page.mouse.move(640, 450);
        await new Promise(r => setTimeout(r, 2000));
        visible = await page.locator(this.verifySelector).isVisible({ timeout: 10000 }).catch(() => false);
      }

      const decision = await this._decideAuthenticated(page, this._ctx, visible);
      if (decision.authenticated) {
        this._lastChallenge = { verdict: 'ok' };
        this._challengeDiagnostics = {};
        logger.info(`[${this.name}] session restored ✅ (${decision.reason})`);
        return { authenticated: true, verdict: { verdict: 'ok' }, diagnostics: base };
      }
      return await fail(challenge, { ...base, reason: decision.reason });
    } catch (err) {
      logger.warn(`[${this.name}] restore attempt failed: ${sanitize(err)}`);
      return await fail({ verdict: 'ok' }, { reason: sanitize(err) });
    } finally {
      watcher?.detach();
    }
  }

  /** Launch a headed ordinary browser, then attach Playwright over local CDP. */
  private async _launchRestoreContext(): Promise<BrowserContext> {
    const probe = await probeDisplay(this.profileDir);
    if (!probe.ok || !probe.headfulBinary) {
      throw new Error(probe.reason ?? 'A graphical session and Chromium are required for browser restore.');
    }
    if (probe.profileLock?.present && !probe.profileLock.stale) {
      throw new Error('The browser profile is already in use by another live process.');
    }
    if (probe.profileLock?.stale) removeStaleProfileLocks(this.profileDir);

    const launch = (noSandbox: boolean) => launchAttachedRestoreBrowser({
      executablePath: probe.headfulBinary!,
      profileDirPath: this.profileDir,
      env: probe.display ? { ...process.env, DISPLAY: probe.display } : { ...process.env },
      windowSize: this._cfg.login?.windowSize,
      noSandbox,
    });

    let attached: AttachedRestoreBrowser;
    if (sandboxOptedOut(this._cfg)) {
      attached = await launch(true);
    } else {
      try {
        attached = await launch(false);
      } catch (err) {
        if (!BaseProvider._sandboxWarned) {
          BaseProvider._sandboxWarned = true;
          logger.warn(`Chromium could not start with its OS sandbox on this host (${sanitize(err)}). Continuing without it. See docs/BROWSER-LOGIN.md for how to enable it.`);
        }
        attached = await launch(true);
      }
    }

    if (attached.identity.webdriver) {
      await attached.close();
      throw new Error('The restore browser reported navigator.webdriver=true; refusing an automation-marked session.');
    }
    logger.info(`[${this.name}] restore browser attached with a consistent ${attached.identity.platform} identity`);
    this._restoreBrowser = attached;
    this._browser = attached.browser;
    return attached.context;
  }

  private async _closeRestoreContext(): Promise<void> {
    const attached = this._restoreBrowser;
    const context = this._ctx;
    this._restoreBrowser = null;
    this._browser = null;
    this._ctx = null;
    if (attached) await attached.close().catch(() => {});
    else if (context) await context.close().catch(() => {});
  }

  /** Observe the page for provider security checks. Never modifies it. */
  private async _domVerdict(page: Page): Promise<ChallengeVerdict> {
    try {
      const markers = await evaluateChallengeMarkers(page as unknown as ObservablePage);
      return classifyDom(markers);
    } catch {
      return { verdict: 'ok' };
    }
  }

  /**
   * Decide whether the restored profile is genuinely signed in.
   *
   * The provider `verifySelector` alone is not enough: for several providers
   * the same element renders while signed out, which used to mark the provider
   * connected even though every request would fail.
   *
   * Only cookie NAMES are inspected. No cookie value is read, stored, logged
   * or returned.
   */
  private async _decideAuthenticated(page: Page, ctx: BrowserContext, verifySelectorVisible: boolean) {
    const signals = authSignalsFor(this.name);
    let host = '';
    let path = '';
    try {
      const parsed = new URL(page.url());
      host = parsed.hostname;
      path = parsed.pathname;
    } catch { /* leave empty */ }

    let hasSessionCookie = false;
    if (signals.sessionCookieNames.length) {
      try {
        // Scoped to the page's own origin. An unscoped read returns every
        // cookie in the profile, so a same-named cookie from another site (a
        // Google account cookie in the Gemini profile, for instance) would mark
        // the provider connected even when its interface never loaded.
        const names = new Set((await ctx.cookies(page.url())).map(c => c.name));
        hasSessionCookie = signals.sessionCookieNames.some(n => names.has(n));
      } catch { hasSessionCookie = false; }
    }

    const anyVisible = async (selectors: readonly string[]): Promise<boolean> => {
      for (const selector of selectors) {
        const visible = await page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false);
        if (visible) return true;
      }
      return false;
    };

    // A sign-in affordance vetoes the session, so confirm it is really there
    // rather than a control that appears for a moment while the interface
    // hydrates — a transient match would report a good session as signed out.
    let loggedOutSelectorVisible = await anyVisible(signals.loggedOutSelectors);
    if (loggedOutSelectorVisible && (hasSessionCookie || verifySelectorVisible)) {
      await new Promise(r => setTimeout(r, 2000));
      loggedOutSelectorVisible = await anyVisible(signals.loggedOutSelectors);
    }

    return decideAuthenticated(signals, {
      host,
      path,
      hasSessionCookie,
      verifySelectorVisible,
      authedSelectorVisible: signals.authedSelectors.length ? await anyVisible(signals.authedSelectors) : false,
      loggedOutSelectorVisible,
    });
  }

  // ── Interactive login ─────────────────────────────────────────────────────

  /** True while a visible login browser is open for this provider. */
  get loginActive(): boolean {
    return this._loginInProgress;
  }

  /** Diagnostics from the last unsuccessful restore or login attempt. */
  get lastLoginDiagnostics(): LoginDiagnostics {
    return { ...this._challengeDiagnostics };
  }

  /** The configured manual-login browser mode. */
  get loginMode(): LoginMode {
    return this._cfg.login?.mode === 'assisted' ? 'assisted' : 'handoff';
  }

  /**
   * The observable-login surface driven by LoginSessionManager.
   *
   * Conduit opens a browser for the person, exposes its active page through the
   * built-in viewer, and observes authentication signals. It never completes a
   * provider security check on the person's behalf.
   */
  loginDriver(): LoginDriver {
    return {
      name: this.name,
      loginUrl: this.loginUrl,
      openLoginBrowser: () => this._openLoginBrowser(),
      observeLoginBrowser: () => this._observeLoginBrowser(),
      closeLoginBrowser: () => this._closeLoginBrowser(),
      verifySession: () => this._verifySession(),
    };
  }

  private async _openLoginBrowser(): Promise<{ viewerUrl: string | null; diagnostics: LoginDiagnostics }> {
    const probe: DisplayProbe = await probeDisplay(this.profileDir);
    if (!probe.ok) throw new Error(probe.reason ?? 'No graphical session is available.');

    mkdirSync(this.profileDir, { recursive: true });

    // Chromium cannot open one profile directory twice, so the headless
    // session must let go before the visible browser can take it. A restore
    // that is mid-launch has not assigned this._ctx yet, so waiting for the
    // flag to clear is the only way to see it.
    for (let i = 0; this._restoring && i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    await this._closeLoginBrowser();
    await this._closeRestoreContext();
    this._loginInProgress = true;

    const diagnostics: LoginDiagnostics = {
      browserMode: this.loginMode,
      displayOk: probe.ok,
      windowManager: probe.windowManager,
      identityMismatch: identitiesDiffer(this._cfg),
    };

    try {
      if (this.loginMode === 'assisted') {
        this._assistedCtx = await chromium.launchPersistentContext(this.profileDir, {
          headless: false,
          args: manualLoginPlaywrightArgs(this._cfg),
          chromiumSandbox: resolveSandboxOption(this._cfg),
          ...manualLoginContextOptions(this._cfg),
        });
        const page = this._assistedCtx.pages()[0] ?? await this._assistedCtx.newPage();
        await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      } else {
        if (!probe.headfulBinary) throw new Error('The login browser is not installed.');
        const executablePath = probe.headfulBinary;
        const launch = (noSandbox: boolean) => launchAttachedRestoreBrowser({
          executablePath,
          profileDirPath: this.profileDir,
          env: probe.display ? { ...process.env, DISPLAY: probe.display } : { ...process.env },
          windowSize: this._cfg.login?.windowSize,
          noSandbox,
          initialUrl: this.loginUrl,
        });
        try {
          this._loginBrowser = await launch(sandboxOptedOut(this._cfg));
        } catch (err) {
          if (sandboxOptedOut(this._cfg)) throw err;
          if (!BaseProvider._sandboxWarned) {
            BaseProvider._sandboxWarned = true;
            logger.warn(`Chromium could not start with its OS sandbox on this host (${sanitize(err)}). Continuing without it. See docs/BROWSER-LOGIN.md.`);
          }
          this._loginBrowser = await launch(true);
        }
        if (this._loginBrowser.identity.webdriver) {
          await this._loginBrowser.close();
          this._loginBrowser = null;
          throw new Error('The login browser reported navigator.webdriver=true; refusing an automation-marked sign-in.');
        }
      }
    } catch (err) {
      this._loginInProgress = false;
      throw err;
    }

    logger.info(`[${this.name}] login browser open (${this.loginMode})`);
    return { viewerUrl: loginViewerUrl(this.name), diagnostics };
  }

  private async _observeLoginBrowser(): Promise<LoginBrowserObservation> {
    if (this.loginMode === 'assisted') {
      const ctx = this._assistedCtx;
      if (!ctx) return { alive: false, verdict: { verdict: 'ok' }, titleAvailable: false };
      let page: Page | undefined;
      try { page = ctx.pages()[0]; } catch { page = undefined; }
      if (!page) return { alive: false, verdict: { verdict: 'ok' }, titleAvailable: false };
      const verdict = await this._domVerdict(page);
      return { alive: true, verdict, titleAvailable: true };
    }

    const page = this._activeLoginPage();
    if (!page) return { alive: false, verdict: { verdict: 'ok' }, titleAvailable: false };
    return { alive: true, verdict: await this._domVerdict(page), titleAvailable: true };
  }

  private async _closeLoginBrowser(): Promise<void> {
    if (this._loginBrowser) {
      const browser = this._loginBrowser;
      this._loginBrowser = null;
      await browser.close().catch(() => {});
    }
    if (this._assistedCtx) {
      const ctx = this._assistedCtx;
      this._assistedCtx = null;
      await ctx.close().catch(() => {});
    }
    this._loginInProgress = false;
  }

  private _activeLoginPage(): Page | null {
    const context = this._loginBrowser?.context ?? this._assistedCtx;
    if (!context) return null;
    try {
      const pages = context.pages().filter(page => !page.isClosed());
      return pages.at(-1) ?? null;
    } catch {
      return null;
    }
  }

  /** Capture the active login page for the built-in viewer on port 31338. */
  async captureLoginFrame(): Promise<Buffer | null> {
    const page = this._activeLoginPage();
    if (!page) return null;
    return await page.screenshot({ type: 'jpeg', quality: 78 }).catch(() => null);
  }

  /** Apply one validated input event to the active login page. */
  async dispatchLoginInput(input: LoginViewerInput): Promise<boolean> {
    const page = this._activeLoginPage();
    if (!page) return false;
    if (input.type === 'pointer') {
      await page.mouse.move(input.x, input.y);
      if (input.action === 'down') await page.mouse.down({ button: input.button ?? 'left' });
      if (input.action === 'up') await page.mouse.up({ button: input.button ?? 'left' });
      return true;
    }
    if (input.type === 'wheel') {
      await page.mouse.wheel(input.deltaX, input.deltaY);
      return true;
    }
    if (input.type === 'key') {
      if (input.action === 'down') await page.keyboard.down(input.key);
      else await page.keyboard.up(input.key);
      return true;
    }
    await page.keyboard.insertText(input.text);
    return true;
  }

  /** Authoritative check of the saved profile after a manual sign-in. */
  private async _verifySession(): Promise<LoginVerification> {
    // Nothing is clicked on the person's behalf during a manual login, not even
    // a cookie banner. The unattended restore path keeps that convenience.
    const result = await this._attemptRestore({ autoAcceptConsent: false });
    if (result.authenticated) this._markVerified();
    return result;
  }

  /**
   * Legacy entry point kept for the CLI and any existing embedder. It runs the
   * same machine as the dashboard and resolves once the session is verified.
   */
  async login(onReady: (loginUrl: string) => void): Promise<void> {
    if (this._loginInProgress) {
      logger.debug(`[${this.name}] login already in progress — skipping`);
      return;
    }
    if (await this.checkSession()) {
      logger.info(`[${this.name}] already connected — skipping login`);
      return;
    }

    // Wait for any active restore to finish before launching login
    if (this._restoring) {
      logger.info(`[${this.name}] restore in progress — waiting before login…`);
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!this._restoring) break;
      }
      if (await this.checkSession()) {
        logger.info(`[${this.name}] connected after restore — skipping login`);
        return;
      }
    }

    const { LoginSessionManager } = await import('../login/session-manager.js');
    let announced = false;
    let final: LoginSnapshot | null = null;
    const manager = new LoginSessionManager({
      timings: this._cfg.login?.timings,
      mode: this.loginMode,
      onTransition: snapshot => {
        final = snapshot;
        if (!announced && snapshot.state === 'browser_ready') {
          announced = true;
          onReady(snapshot.loginUrl ?? this.loginUrl);
        }
        logger.info(`[${this.name}] login ${snapshot.state}: ${snapshot.message}`);
      },
    });

    manager.start(this.loginDriver());
    // Wait for a terminal state; the manager enforces the time budget itself.
    while (manager.active(this.name)) await new Promise(r => setTimeout(r, 250));
    const snapshot: LoginSnapshot | null = manager.snapshot(this.name) ?? final;

    if (snapshot?.state === 'authenticated') {
      logger.info(`[${this.name}] login successful ✅`);
      return;
    }
    const detail = snapshot?.nextAction ?? snapshot?.message ?? 'the login did not complete';
    throw new Error(`Login failed for ${this.name}: ${detail}`);
  }

  async logout(): Promise<void> {
    // Close the visible login browser too, so nothing is left holding the
    // profile directory open.
    await this._closeLoginBrowser().catch(() => {});
    await this._closeRestoreContext();
    // Explicit logout: not an expiry, so reset to a clean unknown state.
    this._loggedIn = false;
    this._sessionStatus = 'unknown';
    logger.info(`[${this.name}] logged out`);
  }

  // ------------------------------------------------------------------------
  // Network interception capability (issue #35 / T-005)
  // ------------------------------------------------------------------------
  // Playwright-native response interception. The heavy lifting lives in
  // ./interception.ts so this shared base file stays small (parallel PRs also
  // edit base.ts). A provider arms a capture on its active page before sending
  // a message; the capture observes the backend streaming endpoint from the
  // network layer, which is markup-agnostic. DOM selector polling remains the
  // automatic fallback inside each provider when the capture yields nothing.

  /**
   * Create a NetworkCapture bound to `page` for this provider's backend
   * streaming endpoint. Call `.arm()` right before sending, poll `.text` /
   * `.done`, and `.detach()` in a finally block.
   */
  protected startNetworkCapture(page: Page, spec: InterceptSpec): NetworkCapture {
    return new NetworkCapture(page, spec, this.name);
  }

  // ── Session expiry tracking (T-004) ──────────────────────────────────────

  /**
   * Snapshot of this browser-login provider's session validity, surfaced in
   * ProviderStatus / the /v1/status response so a client can tell which
   * browser-login providers hold a valid vs expired session.
   */
  get sessionInfo(): SessionInfo {
    return {
      loggedIn: this._loggedIn,
      lastVerified: this._lastVerified,
      status: this._sessionStatus,
    };
  }

  /** Record a verified-good login (updates the last-known-good timestamp). */
  protected _markVerified(): void {
    this._loggedIn = true;
    this._lastVerified = Date.now();
    this._sessionStatus = 'active';
  }

  /**
   * Fold a session-check result into the tracked session state and return the
   * boolean unchanged. `url` is the current page URL when known, used to detect
   * a redirect to a login/auth page (a logged-out signal).
   */
  protected _recordSession(loggedIn: boolean, url: string | null): boolean {
    this._loggedIn = loggedIn;
    if (loggedIn) {
      this._lastVerified = Date.now();
      this._sessionStatus = 'active';
    } else if (url !== null && this._looksChallenged(url)) {
      // A provider security check is in the way. The saved session may still
      // be perfectly good, so this is not an expiry.
      this._sessionStatus = 'unknown';
    } else if (url !== null && this._looksLoggedOut(url)) {
      // Browser was redirected to a login/auth page -> session expired.
      this._sessionStatus = 'expired';
    } else if (this._lastVerified !== null) {
      // Had a good session earlier; the verify selector has since disappeared.
      this._sessionStatus = 'expired';
    }
    // Never verified and no logout signal -> leave status as 'unknown'.
    return loggedIn;
  }

  protected _looksLoggedOut(url: string): boolean {
    if (!url) return false;
    const u = url.toLowerCase();
    if (/\b(login|signin|sign-in|sign_in|authenticate|oauth)\b/.test(u) || u.includes('/i/flow/login')) {
      return true;
    }
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com') ||
          host === 'auth.openai.com' || host.endsWith('.auth.openai.com') ||
          host === 'accounts.x.ai' || host.endsWith('.accounts.x.ai')) {
        return true;
      }
    } catch {
      // url was not a valid absolute URL
    }
    return false;
  }

  /**
   * True when the last observation of this provider was a security check
   * rather than a normal page. Written as a pure predicate beside
   * `_looksLoggedOut` so it can be unit-tested through a subclass.
   */
  protected _looksChallenged(_url: string): boolean {
    const verdict = this._lastChallenge.verdict;
    return verdict === 'challenge_detected' || verdict === 'blocked' || verdict === 'verifying';
  }

  // ── Chat — subclasses implement these ────────────────────────────────────

  abstract chat(req: ChatRequest): Promise<string>;
  abstract chatStream(req: ChatRequest): AsyncGenerator<string>;
}

/** Drops the query string from a URL so diagnostics never carry parameters. */
/**
 * Reduce a URL to origin + path for diagnostics.
 *
 * Both the query string and the fragment are dropped: an implicit-flow OAuth
 * callback returns its access token in the FRAGMENT, so keeping it would put a
 * credential into a status response, a WebSocket frame and the dashboard.
 */
export function stripQuery(url: string): string {
  if (!url) return '';
  const cut = url.search(/[?#]/);
  const base = cut === -1 ? url : url.slice(0, cut);
  return base.slice(0, 200);
}
