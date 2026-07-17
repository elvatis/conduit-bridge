import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/registry.js';
import { OpenRouterApiProvider } from '../src/providers/openrouter-api.js';
import { PerplexityApiProvider } from '../src/providers/perplexity-api.js';
import { LmStudioProvider } from '../src/providers/lmstudio.js';
import { GrokCliProvider, flattenMessages } from '../src/providers/grok-cli.js';
import type { BridgeConfig } from '../src/types.js';

const cfg: BridgeConfig = {
  port: 31338,
  host: '127.0.0.1',
  profileBaseDir: '/tmp/conduit-test-profiles',
  headless: false,
  logLevel: 'silent',
  apiKeys: {},
};

describe('new provider catalogs + ownsModel', () => {
  it('OpenRouter: prefixed catalog, owns its namespace', () => {
    const p = new OpenRouterApiProvider(cfg);
    expect(p.name).toBe('openrouter-api');
    expect(p.models.length).toBeGreaterThan(0);
    expect(p.models.every(m => m.id.startsWith('api-openrouter/'))).toBe(true);
    expect(p.ownsModel('api-openrouter/anthropic/claude-opus-4-8')).toBe(true);
    expect(p.ownsModel('api-perplexity/sonar')).toBe(false);
  });

  it('Perplexity: prefixed catalog incl. sonar, owns its namespace', () => {
    const p = new PerplexityApiProvider(cfg);
    expect(p.name).toBe('perplexity-api');
    expect(p.models.some(m => m.id === 'api-perplexity/sonar')).toBe(true);
    expect(p.models.every(m => m.id.startsWith('api-perplexity/'))).toBe(true);
    expect(p.ownsModel('api-perplexity/openai/gpt-5.5')).toBe(true);
    expect(p.ownsModel('cli-grok/grok-4.5')).toBe(false);
  });

  it('LM Studio: always advertises auto, owns its namespace before discovery', () => {
    const p = new LmStudioProvider(cfg);
    expect(p.name).toBe('lmstudio');
    expect(p.models.some(m => m.id === 'lmstudio/auto')).toBe(true);
    expect(p.ownsModel('lmstudio/auto')).toBe(true);
    expect(p.ownsModel('lmstudio/some-loaded-model')).toBe(true);
    expect(p.ownsModel('api-openrouter/x')).toBe(false);
  });

  it('Grok CLI: prefixed catalog, owns its namespace', () => {
    const p = new GrokCliProvider(cfg);
    expect(p.name).toBe('grok-cli');
    expect(p.models.some(m => m.id === 'cli-grok/grok-4.5')).toBe(true);
    expect(p.models.every(m => m.id.startsWith('cli-grok/'))).toBe(true);
    expect(p.ownsModel('cli-grok/grok-3-mini')).toBe(true);
    expect(p.ownsModel('lmstudio/auto')).toBe(false);
  });
});

describe('registry routing', () => {
  const reg = new ProviderRegistry(cfg);

  it('routes exact catalog ids to the right provider', () => {
    expect(reg.providerForModel('api-openrouter/openai/gpt-5.5')?.name).toBe('openrouter-api');
    expect(reg.providerForModel('api-perplexity/sonar')?.name).toBe('perplexity-api');
    expect(reg.providerForModel('cli-grok/grok-4.5')?.name).toBe('grok-cli');
    expect(reg.providerForModel('lmstudio/auto')?.name).toBe('lmstudio');
  });

  it('routes passthrough ids not in the curated catalog', () => {
    expect(reg.providerForModel('api-openrouter/some/unlisted-model')?.name).toBe('openrouter-api');
    expect(reg.providerForModel('api-perplexity/anything-goes')?.name).toBe('perplexity-api');
    expect(reg.providerForModel('lmstudio/llama-3.1-8b-instruct')?.name).toBe('lmstudio');
    expect(reg.providerForModel('cli-grok/grok-9-future')?.name).toBe('grok-cli');
  });

  it('returns undefined for genuinely unknown ids', () => {
    expect(reg.providerForModel('totally-unknown-model')).toBeUndefined();
  });

  it('allModels includes every new provider namespace', () => {
    const ids = reg.allModels().map(m => m.id);
    expect(ids).toContain('lmstudio/auto');
    expect(ids.some(i => i.startsWith('api-openrouter/'))).toBe(true);
    expect(ids.some(i => i.startsWith('api-perplexity/'))).toBe(true);
    expect(ids.some(i => i.startsWith('cli-grok/'))).toBe(true);
  });
});

describe('grok-cli message flattening', () => {
  it('renders the system preamble then labelled turns', () => {
    const out = flattenMessages([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Bye' },
    ]);
    expect(out.startsWith('Be terse.')).toBe(true);
    expect(out).toContain('User: Hi');
    expect(out).toContain('Assistant: Hello');
    expect(out).toContain('User: Bye');
  });

  it('works with no system message', () => {
    const out = flattenMessages([{ role: 'user', content: 'Just this' }]);
    expect(out).toBe('User: Just this');
  });
});
