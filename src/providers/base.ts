import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter } from '../types.js';
import { profileDir } from '../config.js';
import { logger } from '../logger.js';

export abstract class BaseProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly models: ModelDefinition[];
  abstract readonly loginUrl: string;
  abstract readonly verifySelector: string;

  protected _ctx: BrowserContext | null = null;
  protected _browser: Browser | null = null;
  protected readonly _cfg: BridgeConfig;

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

  async restoreSession(): Promise<boolean> {
    if (!this.hasProfile) {
      logger.debug(`[${this.name}] no profile — skipping restore`);
      return false;
    }

    logger.info(`[${this.name}] restoring session from profile…`);
    try {
      mkdirSync(this.profileDir, { recursive: true });
      this._ctx = await chromium.launchPersistentContext(this.profileDir, {
        headless: true,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      });

      const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      const valid = await page.locator(this.verifySelector).isVisible({ timeout: 8000 }).catch(() => false);
      if (valid) {
        logger.info(`[${this.name}] session restored ✅`);
        return true;
      } else {
        logger.info(`[${this.name}] profile exists but not logged in — skipping`);
        await this._ctx.close().catch(() => {});
        this._ctx = null;
        return false;
      }
    } catch (err) {
      logger.warn(`[${this.name}] restore failed: ${(err as Error).message}`);
      this._ctx = null;
      return false;
    }
  }

  async login(onReady: (loginUrl: string) => void): Promise<void> {
    logger.info(`[${this.name}] launching login browser…`);
    mkdirSync(this.profileDir, { recursive: true });

    // Close any existing context first
    await this.logout();

    // Launch headful (visible) browser so user can log in
    this._ctx = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        // macOS: skip Keychain prompts for stored passwords/cookies
        ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
      ],
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
