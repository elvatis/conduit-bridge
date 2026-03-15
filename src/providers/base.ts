import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter } from '../types.js';
import { profileDir } from '../config.js';
import { logger } from '../logger.js';

// Stealth args to reduce bot detection
const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-infobars',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
];

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
    if (!this._ctx) return false;
    try {
      this._ctx.pages(); // throws if context is closed
      const page = this._ctx.pages()[0];
      if (!page) return false;
      // Try quick check first, then fallback to longer timeout
      const quick = await page.locator(this.verifySelector).isVisible({ timeout: 3000 }).catch(() => false);
      if (quick) return true;
      // Some providers (Gemini) need more time for the element to become visible
      return page.locator(this.verifySelector).count().then(c => c > 0).catch(() => false);
    } catch {
      this._ctx = null;
      return false;
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
      return await this._restoreWithRetry();
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
          args: STEALTH_ARGS,
          ...STEALTH_OPTIONS,
        });

        const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

        // Navigate with generous timeout
        await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for the page to settle - try networkidle first, fall back to a delay
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

        // Handle Google consent dialogs (common for Gemini and other Google services)
        if (page.url().includes('consent.google.com')) {
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
      args: STEALTH_ARGS,
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
    logger.info(`[${this.name}] logged out`);
  }

  // ── Chat — subclasses implement these ────────────────────────────────────

  abstract chat(req: ChatRequest): Promise<string>;
  abstract chatStream(req: ChatRequest): AsyncGenerator<string>;
}
