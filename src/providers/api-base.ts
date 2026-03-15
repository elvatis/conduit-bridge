import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter } from '../types.js';
import { logger } from '../logger.js';

/**
 * Auto-detect API keys/tokens from existing CLI tool configs and env vars.
 * Priority: manual config > CLI tool credentials > environment variables.
 */
function resolveApiKey(provider: ProviderName, cfg: BridgeConfig): string | undefined {
  // 1. Manual config takes priority
  const manual = cfg.apiKeys[provider as keyof typeof cfg.apiKeys];
  if (manual) return manual;

  const home = homedir();

  switch (provider) {
    case 'claude-api': {
      // Claude CLI stores OAuth token in ~/.claude/.credentials.json
      const credFile = join(home, '.claude', '.credentials.json');
      if (existsSync(credFile)) {
        try {
          const creds = JSON.parse(readFileSync(credFile, 'utf-8'));
          const token = creds?.claudeAiOauth?.accessToken;
          if (token) {
            logger.info('[claude-api] auto-detected credentials from Claude CLI (~/.claude/.credentials.json)');
            return token;
          }
        } catch { /* ignore corrupt file */ }
      }
      // Fall back to env var
      if (process.env.ANTHROPIC_API_KEY) {
        logger.info('[claude-api] using ANTHROPIC_API_KEY from environment');
        return process.env.ANTHROPIC_API_KEY;
      }
      break;
    }

    case 'gemini-api': {
      // Gemini CLI stores OAuth token in ~/.gemini/oauth_creds.json
      const credFile = join(home, '.gemini', 'oauth_creds.json');
      if (existsSync(credFile)) {
        try {
          const creds = JSON.parse(readFileSync(credFile, 'utf-8'));
          const token = creds?.access_token;
          if (token) {
            logger.info('[gemini-api] auto-detected credentials from Gemini CLI (~/.gemini/oauth_creds.json)');
            return token;
          }
        } catch { /* ignore corrupt file */ }
      }
      // Fall back to env vars
      if (process.env.GEMINI_API_KEY) {
        logger.info('[gemini-api] using GEMINI_API_KEY from environment');
        return process.env.GEMINI_API_KEY;
      }
      if (process.env.GOOGLE_API_KEY) {
        logger.info('[gemini-api] using GOOGLE_API_KEY from environment');
        return process.env.GOOGLE_API_KEY;
      }
      break;
    }

    case 'codex-api': {
      // OpenAI/Codex CLI - check env var
      if (process.env.OPENAI_API_KEY) {
        logger.info('[codex-api] using OPENAI_API_KEY from environment');
        return process.env.OPENAI_API_KEY;
      }
      break;
    }
  }

  return undefined;
}

/**
 * Base class for API/SDK-based providers.
 * Unlike BaseProvider (Playwright), these use official npm SDKs and API keys.
 * No browser needed - always "connected" if an API key is configured.
 */
export abstract class ApiBaseProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly models: ModelDefinition[];

  protected readonly _cfg: BridgeConfig;
  private _resolvedKey: string | undefined | null = null; // null = not yet resolved

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
  }

  /** Returns the API key for this provider, auto-detecting from CLI tools and env vars */
  protected get apiKey(): string | undefined {
    if (this._resolvedKey === null) {
      this._resolvedKey = resolveApiKey(this.name, this._cfg);
    }
    return this._resolvedKey;
  }

  /** Force re-resolve the API key (e.g. after config change or token refresh) */
  protected refreshApiKey(): void {
    this._resolvedKey = null;
  }

  /** API providers are "connected" if an API key is available */
  async checkSession(): Promise<boolean> {
    return !!this.apiKey;
  }

  async ensureConnected(): Promise<boolean> {
    // Re-resolve key each time to pick up token refreshes
    this.refreshApiKey();
    if (!this.apiKey) {
      logger.warn(`[${this.name}] no API key found. Options:`);
      logger.warn(`  1. Log into the provider's CLI tool (claude, gemini, codex) - auto-detected`);
      logger.warn(`  2. Set env var (ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY)`);
      logger.warn(`  3. Manual: conduit-bridge config apiKeys.${this.name} <key>`);
      return false;
    }
    return true;
  }

  /** API providers don't need browser login - guide user to CLI login instead */
  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      `${this.name} uses API keys, not browser login. ` +
      `Log into the provider's CLI tool, set an env var, or run: ` +
      `conduit-bridge config apiKeys.${this.name} <key>`,
    );
  }

  async logout(): Promise<void> {
    logger.info(`[${this.name}] API provider - nothing to disconnect`);
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  abstract chat(req: ChatRequest): Promise<string>;
  abstract chatStream(req: ChatRequest): AsyncGenerator<string>;
}
