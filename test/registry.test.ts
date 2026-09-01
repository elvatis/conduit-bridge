import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeConfig, ProviderName } from '../src/types.js';

import { ProviderRegistry } from '../src/registry.js';

const ALL_PROVIDERS: ProviderName[] = [
  'claude-api', 'gemini-api', 'codex-api',
  'openrouter-api', 'perplexity-api', 'lmstudio', 'cli-grok',
  'cli-codex', 'cli-claude', 'cli-gemini',
];

function testConfig(): BridgeConfig {
  return {
    port: 31338,
    host: '127.0.0.1',
    logLevel: 'silent',
    apiKeys: {},
  };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry(testConfig());
  });

  describe('provider registration', () => {
    it('registers all ten built-in providers', () => {
      for (const name of ALL_PROVIDERS) {
        expect(registry.get(name).name).toBe(name);
      }
    });

    it('exposes models from every provider via allModels', () => {
      const models = registry.allModels();
      expect(models.length).toBeGreaterThan(0);
      // Every registered provider contributes its models to the aggregate list.
      for (const name of ALL_PROVIDERS) {
        const providerModelCount = registry.get(name).models.length;
        const inAggregate = models.filter(m => m.provider === name).length;
        expect(inAggregate).toBe(providerModelCount);
      }
    });

    it('gives every model a unique id', () => {
      const ids = registry.allModels().map(m => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('providerForModel lookup', () => {
    it('resolves an API model id to the owning provider', () => {
      const claudeApiModelId = registry.get('claude-api').models[0].id;
      const provider = registry.providerForModel(claudeApiModelId);
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('claude-api');
    });

    it('resolves every advertised model id back to a provider', () => {
      for (const m of registry.allModels()) {
        expect(registry.providerForModel(m.id)?.name).toBe(m.provider);
      }
    });

    it('returns undefined for an unknown model id', () => {
      expect(registry.providerForModel('does-not-exist/model-x')).toBeUndefined();
      expect(registry.providerForModel('')).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('reports a structural status snapshot for all providers', async () => {
      const status = await registry.getStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(31338);
      expect(typeof status.version).toBe('string');
      expect(status.version.length).toBeGreaterThan(0);
      expect(status.uptime).toBeGreaterThanOrEqual(0);

      expect(status.providers).toHaveLength(ALL_PROVIDERS.length);
      const names = status.providers.map(p => p.name).sort();
      expect(names).toEqual([...ALL_PROVIDERS].sort());

      for (const p of status.providers) {
        expect(Array.isArray(p.models)).toBe(true);
        expect(typeof p.connected).toBe('boolean');
        expect(['api-key', 'cli', 'local']).toContain(p.loginType);
      }
    });
  });
});
