import type { BridgeConfig, ProviderName, ProviderStatus, BridgeStatus, ModelDefinition, ProviderAdapter } from './types.js';
import { ClaudeApiProvider } from './providers/claude-api.js';
import { GeminiApiProvider } from './providers/gemini-api.js';
import { CodexApiProvider } from './providers/codex-api.js';
import { OpenRouterApiProvider } from './providers/openrouter-api.js';
import { PerplexityApiProvider } from './providers/perplexity-api.js';
import { LmStudioProvider } from './providers/lmstudio.js';
import { GrokCliProvider } from './providers/grok-cli.js';
import { CodexCliProvider } from './providers/cli-codex.js';
import { ClaudeCliProvider } from './providers/cli-claude.js';
import { GeminiCliProvider } from './providers/cli-gemini.js';
import { reloadCatalogs } from './model-catalog.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

export class ProviderRegistry {
  private _providers: Map<ProviderName, ProviderAdapter> = new Map();
  private _startTime = Date.now();

  constructor(private _cfg: BridgeConfig) {
    // Direct API/SDK providers
    this._providers.set('claude-api', new ClaudeApiProvider(_cfg));
    this._providers.set('gemini-api', new GeminiApiProvider(_cfg));
    this._providers.set('codex-api',  new CodexApiProvider(_cfg));

    // OpenAI-compatible API aggregators
    this._providers.set('openrouter-api', new OpenRouterApiProvider(_cfg));
    this._providers.set('perplexity-api', new PerplexityApiProvider(_cfg));

    // Local providers (no key needed / local subprocess / coding CLIs)
    this._providers.set('lmstudio', new LmStudioProvider(_cfg));
    this._providers.set('cli-grok', new GrokCliProvider(_cfg));
    this._providers.set('cli-codex', new CodexCliProvider(_cfg));
    this._providers.set('cli-claude', new ClaudeCliProvider(_cfg));
    this._providers.set('cli-gemini', new GeminiCliProvider(_cfg));
  }

  get(name: ProviderName): ProviderAdapter {
    const provider = this._providers.get(name);
    if (!provider) throw new Error(`Unknown provider: ${name}`);
    return provider;
  }

  lookup(name: string): ProviderAdapter | undefined {
    return this._providers.get(name as ProviderName);
  }

  /**
   * Every model a caller could actually reach.
   *
   * A provider with no credential is skipped: advertising its catalog puts
   * models in the picker whose request can only fail on auth, which is the same
   * defect as a hardcoded id the CLI no longer serves. Providers that do not
   * implement hasCredentials (the CLI ones, which have their own detection) are
   * always included.
   */
  allModels(): ModelDefinition[] {
    return [...this._providers.values()]
      .filter(p => p.hasCredentials?.() !== false)
      .flatMap(p => p.models);
  }

  /** Every model including unreachable ones — for status and diagnostics. */
  allModelsIncludingUnavailable(): ModelDefinition[] {
    return [...this._providers.values()].flatMap(p => p.models);
  }

  /**
   * Re-read every provider's model catalog. Reached only from the explicit
   * POST /v1/models/refresh, so it passes `force` — a user pressing Refresh
   * means "ask again now", not "answer from the cache you filled a minute ago".
   * Providers with no TTL simply ignore the argument.
   */
  async refreshApiModels(): Promise<Record<string, number>> {
    // Pick up an edited ~/.conduit/models.json in the same action, so adding a
    // model there needs neither a rebuild nor a restart.
    reloadCatalogs();
    const result: Record<string, number> = {};
    for (const provider of this._providers.values()) {
      const refresh = (provider as ProviderAdapter & { refreshModels?: (force?: boolean) => Promise<number> }).refreshModels;
      if (refresh) result[provider.name] = await refresh.call(provider, true);
    }
    return result;
  }

  providerForModel(modelId: string): ProviderAdapter | undefined {
    const providers = [...this._providers.values()];
    // Prefer an exact match against a provider's enumerated models…
    const exact = providers.find(p => p.models.some(m => m.id === modelId));
    if (exact) return exact;
    // …then let passthrough/dynamic providers claim by prefix (e.g. api-openrouter/…).
    return providers.find(p => p.ownsModel?.(modelId));
  }

  async getStatus(): Promise<BridgeStatus> {
    const providers: ProviderStatus[] = [];

    for (const [name, p] of this._providers) {
      const connected = await p.checkSession();
      const loginType = name.startsWith('cli-') ? 'cli' : name === 'lmstudio' ? 'local' : 'api-key';
      providers.push({
        name,
        connected,
        models: p.models.map(m => m.id),
        loginType,
        credentialSource: p.credentialSource,
      });
    }

    return {
      running: true,
      port: this._cfg.port,
      version: VERSION,
      providers,
      uptime: Math.floor((Date.now() - this._startTime) / 1000),
    };
  }
}
