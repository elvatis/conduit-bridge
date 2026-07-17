import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter, SessionInfo, SessionStatus } from '../types.js';
import { profileDir } from '../config.js';
import { logger } from '../logger.js';
import { NetworkCapture, type InterceptSpec } from './interception.js';

// Stealth args to reduce bot detection.
//
// Security note: two flags were removed from the defaults because they weaken
// the browser's own protections and are not required for stealth:
//   - '--no-sandbox' disabled the Chromium OS sandbox. It now stays ON by
//     default and is re-enabled only via explicit opt-in (see resolveLaunchArgs).
//   - '--disable-features=IsolateOrigins,site-per-process' disabled site
//     isolation. Site isolation now stays ON.
// '--disable-blink-features=AutomationControlled' is kept: it only hides the
// navigator.webdriver automation flag (the load-bearing stealth signal) and
// does not relax the sandbox or site isolation.
const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
];

/**
 * Resolve the Chromium launch args for a config. The sandbox stays ON by
 * default; '--no-sandbox' is appended only when explicitly opted in via
 * BridgeConfig.chromiumNoSandbox or the CONDUIT_NO_SANDBOX=1 environment
 * variable (needed for some root-in-container setups).
 */
export function resolveLaunchArgs(cfg: BridgeConfig): string[] {
  const noSandbox = cfg.chromiumNoSandbox === true || process.env.CONDUIT_NO_SANDBOX === '1';
  return noSandbox ? [...STEALTH_ARGS, '--no-sandbox'] : [...STEALTH_ARGS];
}

const STEALTH_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
  timezoneId: 'Europe/Berlin',
};

export abstract class BaseProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly models: ModelDefinition[];
  abstract readonly loginUrl: string;
  abstract readonly verifySelector: string;

  protected _ctx: BrowserContext | null = null;
  protected _browser: Browser | null = null;
  protected readonly _cfg: BridgeConfig;
  private _restoring = false;
  private _loginInProgress = false;

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
    if (!this._ctx) return this._recordSession(false, null);
    try {
      this._ctx.pages(); // throws if context is closed
      const page = this._ctx.pages()[0];
      if (!page) return this._recordSession(false, null);
      // Try quick check first, then fallback to longer timeout
      const quick = await page.locator(this.verifySelector).isVisible({ timeout: 3000 }).catch(() => false);
      if (quick) return this._recordSession(true, page.url());
      // Some providers (Gemini) need more time for the element to become visible
      const present = await page.locator(this.verifySelector).count().then(c => c > 0).catch(() => false);
      return this._recordSession(present, page.url());
    } catch {
      this._ctx = null;
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

      // Close any stale context
      if (this._ctx) {
        await this._ctx.close().catch(() => {});
        this._ctx = null;
      }

      try {
        mkdirSync(this.profileDir, { recursive: true });
        this._ctx = await chromium.launchPersistentContext(this.profileDir, {
          headless: true,
          args: resolveLaunchArgs(this._cfg),
          ...STEALTH_OPTIONS,
        });

        const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

        // Navigate with generous timeout
        await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for the page to settle - try networkidle first, fall back to a delay
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

        // Handle Google consent dialogs (common for Gemini and other Google services)
        let _onConsentPage = false;
        try { const _p = new URL(page.url()); _onConsentPage = _p.hostname === 'consent.google.com'; } catch { _onConsentPage = false; }
        if (_onConsentPage) {
          logger.debug(`[${this.name}] consent dialog detected, auto-accepting...`);
          const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Alle akzeptieren"), button:has-text("I agree"), button:has-text("Akzeptieren")').first();
          if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await acceptBtn.click();
            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
          }
        }

        // Give SPAs extra time to render (React/Vue hydration)
        await new Promise(r => setTimeout(r, 5000));

        // Check for the verify selector with a generous timeout
        const valid = await page.locator(this.verifySelector).isVisible({ timeout: 30000 }).catch(() => false);
        if (valid) {
          logger.info(`[${this.name}] session restored ✅`);
          return true;
        }

        // Debug: check if the element exists but isn't visible
        const count = await page.locator(this.verifySelector).count().catch(() => 0);
        if (count > 0) {
          logger.debug(`[${this.name}] selector exists (${count} elements) but not visible — retrying with waitFor`);
          const waitResult = await page.locator(this.verifySelector).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
          if (waitResult) {
            logger.info(`[${this.name}] session restored (waitFor) ✅`);
            return true;
          }
        }

        // If not visible, try scrolling/clicking to trigger lazy load
        await page.mouse.move(640, 450);
        await new Promise(r => setTimeout(r, 2000));
        const validRetry = await page.locator(this.verifySelector).isVisible({ timeout: 10000 }).catch(() => false);
        if (validRetry) {
          logger.info(`[${this.name}] session restored (after interaction) ✅`);
          return true;
        }

        logger.info(`[${this.name}] selector not found on attempt ${attempt + 1} (url: ${page.url().slice(0, 80)})`);
        await this._ctx.close().catch(() => {});
        this._ctx = null;
      } catch (err) {
        logger.warn(`[${this.name}] restore attempt ${attempt + 1} failed: ${(err as Error).message}`);
        if (this._ctx) {
          await this._ctx.close().catch(() => {});
          this._ctx = null;
        }
      }
    }

    logger.info(`[${this.name}] profile exists but not logged in — all attempts exhausted`);
    return false;
  }

  async login(onReady: (loginUrl: string) => void): Promise<void> {
    // Skip if already connected or login already running
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
      // Check again after restore
      if (await this.checkSession()) {
        logger.info(`[${this.name}] connected after restore — skipping login`);
        return;
      }
    }

    this._loginInProgress = true;
    logger.info(`[${this.name}] launching login browser…`);
    mkdirSync(this.profileDir, { recursive: true });

    // Close any existing context first
    await this.logout();

    // Launch headful (visible) browser so user can log in
    const loginCtx = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      args: resolveLaunchArgs(this._cfg),
      ...STEALTH_OPTIONS,
    });
    this._ctx = loginCtx;

    const page = loginCtx.pages()[0] ?? await loginCtx.newPage();
    await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });

    onReady(this.loginUrl);
    logger.info(`[${this.name}] browser open — waiting for login…`);

    // Wait until user is logged in (verifySelector appears)
    try {
      await page.locator(this.verifySelector).waitFor({ timeout: 300000 }); // 5min
      this._markVerified();
      logger.info(`[${this.name}] login successful ✅`);
    } catch {
      logger.warn(`[${this.name}] login timed out`);
      await loginCtx.close().catch(() => {});
      // Only null the context if nothing else replaced it (e.g. a restore)
      if (this._ctx === loginCtx) this._ctx = null;
      throw new Error(`Login timed out for ${this.name}`);
    } finally {
      this._loginInProgress = false;
    }
  }

  async logout(): Promise<void> {
    if (this._ctx) {
      await this._ctx.close().catch(() => {});
      this._ctx = null;
    }
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

  /**
   * Heuristic: does this URL look like a login / auth / sign-in page?
   * Subclasses may override for a provider-specific logged-out signal.
   */
  protected _looksLoggedOut(url: string): boolean {
    if (!url) return false;
    const u = url.toLowerCase();
    return /\b(login|signin|sign-in|sign_in|authenticate|oauth)\b/.test(u)
      || u.includes('accounts.google.com')
      || u.includes('auth.openai.com')
      || u.includes('/i/flow/login');
  }

  // ── Chat — subclasses implement these ────────────────────────────────────

  abstract chat(req: ChatRequest): Promise<string>;
  abstract chatStream(req: ChatRequest): AsyncGenerator<string>;
}
