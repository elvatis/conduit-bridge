import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeConfig, ProviderName } from '../src/types.js';

import { ProviderRegistry } from '../src/registry.js';

const ALL_PROVIDERS: ProviderName[] = [
  'claude-api', 'gemini-api', 'codex-api',
  'openrouter-api', 'perplexity-api', 'lmstudio', 'bitnet', 'cli-grok',
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
    it('registers all eleven built-in providers', () => {
      for (const name of ALL_PROVIDERS) {
        expect(registry.get(name).name).toBe(name);
      }
    });

    it('exposes models from every reachable provider via allModels', () => {
      const models = registry.allModels();
      expect(models.length).toBeGreaterThan(0);
      // A provider contributes its full catalog, or nothing at all when it has
      // no credential — never a partial list.
      for (const name of ALL_PROVIDERS) {
        const provider = registry.get(name);
        const usable = provider.hasCredentials?.() !== false;
        const inAggregate = models.filter(m => m.provider === name).length;
        expect(inAggregate, name).toBe(usable ? provider.models.length : 0);
      }
    });

    // Advertising a model whose provider has no key puts an entry in the picker
    // whose request can only fail on auth — the same defect as a hardcoded id
    // the CLI no longer serves.
    it('hides a provider with no credential, and says so in the full list', () => {
      const keyless = ALL_PROVIDERS.filter(n => registry.get(n).hasCredentials?.() === false);
      const advertised = new Set(registry.allModels().map(m => m.provider));
      const everything = registry.allModelsIncludingUnavailable();
      for (const name of keyless) {
        expect(advertised.has(name), `${name} advertised without a credential`).toBe(false);
        expect(everything.some(m => m.provider === name), name).toBe(true);
      }
    });

    it('still routes a model whose provider lacks a credential, for a clear error', () => {
      // Hiding it from the catalog must not turn an auth failure into
      // "unknown model" — providerForModel reads each provider directly.
      for (const name of ALL_PROVIDERS) {
        const provider = registry.get(name);
        if (provider.hasCredentials?.() !== false) continue;
        const id = provider.models[0]?.id;
        if (!id) continue;
        expect(registry.providerForModel(id)?.name, id).toBe(name);
      }
    });

    it('gives every model a unique id', () => {
      const ids = registry.allModels().map(m => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('attaches capability metadata to every catalog row', () => {
      const cli = registry.allModelsIncludingUnavailable().find(m => m.provider === 'cli-claude');
      expect(cli?.capabilities).toMatchObject({
        modes: ['chat', 'plan', 'agent'],
        streaming: 'turn',
        nativeResume: true,
        local: false,
      });
      expect(cli?.capabilities?.effort.length).toBeGreaterThan(0);
      const local = registry.allModelsIncludingUnavailable().find(m => m.provider === 'bitnet');
      expect(local?.capabilities).toMatchObject({
        modes: ['chat'],
        streaming: 'token',
        nativeResume: false,
        local: true,
      });
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
