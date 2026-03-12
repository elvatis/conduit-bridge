import type { BridgeConfig, ProviderName, ProviderStatus, BridgeStatus, ModelDefinition } from './types.js';
import type { BaseProvider } from './providers/base.js';
import { GrokProvider } from './providers/grok.js';
import { ClaudeProvider } from './providers/claude.js';
import { GeminiProvider } from './providers/gemini.js';
import { ChatGPTProvider } from './providers/chatgpt.js';
import { logger } from './logger.js';

const VERSION = '0.1.0';

export class ProviderRegistry {
  private _providers: Map<ProviderName, BaseProvider> = new Map();
  private _startTime = Date.now();
  private _restoreDone = false;

  constructor(private _cfg: BridgeConfig) {
    this._providers.set('grok',    new GrokProvider(_cfg));
    this._providers.set('claude',  new ClaudeProvider(_cfg));
    this._providers.set('gemini',  new GeminiProvider(_cfg));
    this._providers.set('chatgpt', new ChatGPTProvider(_cfg));
  }

  get(name: ProviderName): BaseProvider {
    return this._providers.get(name)!;
  }

  allModels(): ModelDefinition[] {
    return [...this._providers.values()].flatMap(p => p.models);
  }

  providerForModel(modelId: string): BaseProvider | undefined {
    return [...this._providers.values()].find(p =>
      p.models.some(m => m.id === modelId),
    );
  }

  /** Restore sessions from saved profiles — sequential, profile-gated */
  async restoreSessions(): Promise<void> {
    if (this._restoreDone) return;
    this._restoreDone = true;

    logger.info('Restoring sessions from saved profiles…');
    const providers = [...this._providers.values()];

    for (const p of providers) {
      if (!p.hasProfile) {
        logger.debug(`[${p.name}] no profile — skipping`);
        continue;
      }
      try {
        await p.restoreSession();
      } catch (err) {
        logger.warn(`[${p.name}] restore error: ${(err as Error).message}`);
      }
      // Sequential delay to avoid OOM
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async getStatus(): Promise<BridgeStatus> {
    const providers: ProviderStatus[] = [];

    for (const [name, p] of this._providers) {
      const sessionValid = await p.checkSession();
      providers.push({
        name,
        connected: sessionValid,
        hasProfile: p.hasProfile,
        sessionValid,
        models: p.models.map(m => m.id),
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
