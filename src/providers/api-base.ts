import type { BridgeConfig, ProviderName, ChatRequest, ModelDefinition, ProviderAdapter } from '../types.js';
import { logger } from '../logger.js';

/**
 * Resolve direct API credentials. CLI authentication is intentionally
 * independent and is represented by the corresponding cli-* provider.
 */
interface CredentialResolution { key?: string; source: string }

function resolveApiKey(provider: ProviderName, cfg: BridgeConfig): CredentialResolution {
  // 1. Manual config takes priority
  const manual = cfg.apiKeys[provider as keyof typeof cfg.apiKeys];
  if (manual) return { key: manual, source: 'Bridge config' };

  switch (provider) {
    case 'claude-api': {
      if (process.env.ANTHROPIC_API_KEY) {
        logger.info('[claude-api] using ANTHROPIC_API_KEY from environment');
        return { key: process.env.ANTHROPIC_API_KEY, source: 'ANTHROPIC_API_KEY environment variable' };
      }
      break;
    }

    case 'gemini-api': {
      if (process.env.GEMINI_API_KEY) {
        logger.info('[gemini-api] using GEMINI_API_KEY from environment');
        return { key: process.env.GEMINI_API_KEY, source: 'GEMINI_API_KEY environment variable' };
      }
      if (process.env.GOOGLE_API_KEY) {
        logger.info('[gemini-api] using GOOGLE_API_KEY from environment');
        return { key: process.env.GOOGLE_API_KEY, source: 'GOOGLE_API_KEY environment variable' };
      }
      break;
    }

    case 'codex-api': {
      if (process.env.OPENAI_API_KEY) {
        logger.info('[codex-api] using OPENAI_API_KEY from environment');
        return { key: process.env.OPENAI_API_KEY, source: 'OPENAI_API_KEY environment variable' };
      }
      break;
    }

    case 'openrouter-api': {
      if (process.env.OPENROUTER_API_KEY) {
        logger.info('[openrouter-api] using OPENROUTER_API_KEY from environment');
        return { key: process.env.OPENROUTER_API_KEY, source: 'OPENROUTER_API_KEY environment variable' };
      }
      break;
    }

    case 'perplexity-api': {
      if (process.env.PERPLEXITY_API_KEY) {
        logger.info('[perplexity-api] using PERPLEXITY_API_KEY from environment');
        return { key: process.env.PERPLEXITY_API_KEY, source: 'PERPLEXITY_API_KEY environment variable' };
      }
      break;
    }
  }

  return { source: 'Not detected' };
}

/**
 * Base class for API/SDK-based providers.
 * These use provider APIs and are connected only when an API key is configured.
 */
export abstract class ApiBaseProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly models: ModelDefinition[];

  protected readonly _cfg: BridgeConfig;
  private _resolvedCredential: CredentialResolution | null = null;

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
  }

  /** Returns the API key from Bridge config or a provider environment variable. */
  protected get apiKey(): string | undefined {
    if (this._resolvedCredential === null) {
      this._resolvedCredential = resolveApiKey(this.name, this._cfg);
    }
    return this._resolvedCredential.key;
  }

  /** Human-readable credential origin; never contains the credential. */
  get credentialSource(): string {
    if (this._resolvedCredential === null) {
      this._resolvedCredential = resolveApiKey(this.name, this._cfg);
    }
    return this._resolvedCredential.source;
  }

  /** Force re-resolve the API key (e.g. after config change or token refresh) */
  protected refreshApiKey(): void {
    this._resolvedCredential = null;
  }

  /**
   * Whether this provider has a usable credential right now.
   *
   * Synchronous on purpose: `allModels()` cannot await, and the question is not
   * "is the service reachable" but "can this request possibly be authorised".
   * A provider with no key advertising its catalog is the same defect as a
   * hardcoded model the CLI no longer serves — the picker offers it and the
   * request can only fail.
   */
  hasCredentials(): boolean {
    return !!this.apiKey;
  }

  /** API providers are "connected" if an API key is available */
  async checkSession(): Promise<boolean> {
    return !!this.apiKey;
  }

  async ensureConnected(): Promise<boolean> {
    // Re-resolve key each time to pick up token refreshes
    this.refreshApiKey();
    if (!this.apiKey) {
      logger.warn(`[${this.name}] no API key found. Add it in Bridge Settings or set the provider environment variable.`);
      return false;
    }
    return true;
  }

  /** Compatibility method retained for direct adapter users. */
  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      `${this.name} requires its own API key. ` +
      `Set an environment variable or run: ` +
      `conduit-bridge config apiKeys.${this.name} <key>`,
    );
  }

  async logout(): Promise<void> {
    logger.info(`[${this.name}] API provider - nothing to disconnect`);
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  /** Fetch and replace a provider's public model catalog when supported. */
  protected async refreshModelCatalog(endpoint: string, prefix: string): Promise<number> {
    if (!this.apiKey) return 0;
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { data?: Array<{ id?: string; owned_by?: string }> };
      const remote = (body.data ?? []).filter(item => typeof item.id === 'string' && item.id.trim()).map(item => ({
        id: prefix + item.id!.trim(),
        provider: this.name,
        displayName: item.id!.trim(),
        owned_by: item.owned_by || item.id!.split('/')[0] || this.name,
        availability: 'verified' as const,
        source: 'provider-api',
      }));
      if (!remote.length) return 0;
      this.models.splice(0, this.models.length, ...remote);
      logger.info(`[${this.name}] refreshed ${remote.length} models from provider catalog`);
      return remote.length;
    } catch (err) {
      logger.warn(`[${this.name}] model catalog refresh failed: ${(err as Error).message}`);
      return 0;
    }
  }

  async embeddings(input: string | string[], model: string, signal?: AbortSignal): Promise<{ data: Array<{ object: string; embedding: number[]; index: number }>; model: string }> {
    const endpoint = this.name === 'openrouter-api' ? 'https://openrouter.ai/api/v1/embeddings' : 'https://api.openai.com/v1/embeddings';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
      signal,
    });
    const data = await response.json() as any;
    if (!response.ok) throw new Error(data?.error?.message || 'Embedding provider request failed');
    return data;
  }

  abstract chat(req: ChatRequest): Promise<string>;
  abstract chatStream(req: ChatRequest): AsyncGenerator<string>;
}
