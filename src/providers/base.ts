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
      return page.locator(this.verifySelector).isVisible({ timeout: 3000 }).catch(() => false);
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

        // Give SPAs extra time to render (React/Vue hydration)
        await new Promise(r => setTimeout(r, 2000));

        // Check for the verify selector with a generous timeout
        const valid = await page.locator(this.verifySelector).isVisible({ timeout: 15000 }).catch(() => false);
        if (valid) {
          logger.info(`[${this.name}] session restored ✅`);
          return true;
        }

        // If not visible, try scrolling/clicking to trigger lazy load
        await page.mouse.move(640, 450);
        await new Promise(r => setTimeout(r, 1000));
        const validRetry = await page.locator(this.verifySelector).isVisible({ timeout: 5000 }).catch(() => false);
        if (validRetry) {
          logger.info(`[${this.name}] session restored (after interaction) ✅`);
          return true;
        }

        logger.info(`[${this.name}] selector not found on attempt ${attempt + 1}`);
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
    logger.info(`[${this.name}] launching login browser…`);
    mkdirSync(this.profileDir, { recursive: true });

    // Close any existing context first
    await this.logout();

    // Launch headful (visible) browser so user can log in
    this._ctx = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      args: STEALTH_ARGS,
      ...STEALTH_OPTIONS,
    });

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
    await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });

    onReady(this.loginUrl);
    logger.info(`[${this.name}] browser open — waiting for login…`);

    // Wait until user is logged in (verifySelector appears)
    try {
      await page.locator(this.verifySelector).waitFor({ timeout: 300000 }); // 5min
      logger.info(`[${this.name}] login successful ✅`);
    } catch {
      logger.warn(`[${this.name}] login timed out`);
      await this._ctx.close().catch(() => {});
      this._ctx = null;
      throw new Error(`Login timed out for ${this.name}`);
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
