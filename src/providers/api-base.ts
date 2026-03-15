import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter } from '../types.js';
import { logger } from '../logger.js';

/**
 * Base class for API/SDK-based providers.
 * Unlike BaseProvider (Playwright), these use official npm SDKs and API keys.
 * No browser needed - always "connected" if an API key is configured.
 */
export abstract class ApiBaseProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly models: ModelDefinition[];

  protected readonly _cfg: BridgeConfig;

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
  }

  /** Returns the API key for this provider from config */
  protected get apiKey(): string | undefined {
    return this._cfg.apiKeys[this.name as keyof typeof this._cfg.apiKeys];
  }

  /** API providers are "connected" if an API key is set */
  async checkSession(): Promise<boolean> {
    return !!this.apiKey;
  }

  async ensureConnected(): Promise<boolean> {
    if (!this.apiKey) {
      logger.warn(`[${this.name}] no API key configured. Set it via: conduit-bridge config apiKeys.${this.name} <key>`);
      return false;
    }
    return true;
  }

  /** API providers don't need browser login */
  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(`${this.name} uses API keys, not browser login. Set your key via: conduit-bridge config apiKeys.${this.name} <key>`);
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
