import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-providers-test-home'),
  };
});

import { ProviderRegistry } from '../src/registry.js';
import { OpenRouterApiProvider } from '../src/providers/openrouter-api.js';
import { PerplexityApiProvider } from '../src/providers/perplexity-api.js';
import { ClaudeApiProvider } from '../src/providers/claude-api.js';
import { GeminiApiProvider } from '../src/providers/gemini-api.js';
import { CodexApiProvider } from '../src/providers/codex-api.js';
import { LmStudioProvider } from '../src/providers/lmstudio.js';
import { GrokCliProvider } from '../src/providers/grok-cli.js';
import { CodexCliProvider } from '../src/providers/cli-codex.js';
import { ClaudeCliProvider } from '../src/providers/cli-claude.js';
import { GeminiCliProvider } from '../src/providers/cli-gemini.js';
import { flattenMessages } from '../src/providers/cli-util.js';
import type { BridgeConfig } from '../src/types.js';

const cfg: BridgeConfig = {
  port: 31338,
  host: '127.0.0.1',
  logLevel: 'silent',
  apiKeys: {},
};

describe('new provider catalogs + ownsModel', () => {
  it('keeps API credentials independent from CLI authentication', () => {
    const names = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY'] as const;
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const home = join(tmpdir(), 'conduit-bridge-providers-test-home');
    mkdirSync(join(home, '.claude'), { recursive: true });
    mkdirSync(join(home, '.codex'), { recursive: true });
    mkdirSync(join(home, '.gemini'), { recursive: true });
    writeFileSync(join(home, '.claude', '.credentials.json'), '{"placeholder":"cli-oauth"}');
    writeFileSync(join(home, '.codex', 'auth.json'), '{"placeholder":"cli-oauth"}');
    writeFileSync(join(home, '.gemini', 'oauth_creds.json'), '{"placeholder":"cli-oauth"}');
    try {
      for (const name of names) delete process.env[name];
      expect(new ClaudeApiProvider(cfg).credentialSource).toBe('Not detected');
      expect(new GeminiApiProvider(cfg).credentialSource).toBe('Not detected');
      expect(new CodexApiProvider(cfg).credentialSource).toBe('Not detected');

      const configured = { ...cfg, apiKeys: { 'claude-api': 'test-value' } };
      expect(new ClaudeApiProvider(configured).credentialSource).toBe('Bridge config');
      expect(new GeminiApiProvider(configured).credentialSource).toBe('Not detected');
      expect(new CodexApiProvider(configured).credentialSource).toBe('Not detected');
    } finally {
      for (const name of names) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });

  it('OpenRouter: prefixed catalog, owns its namespace', () => {
    const p = new OpenRouterApiProvider(cfg);
    expect(p.name).toBe('openrouter-api');
    expect(p.models.length).toBeGreaterThan(0);
    expect(p.models.every(m => m.id.startsWith('api-openrouter/'))).toBe(true);
    expect(p.ownsModel('api-openrouter/anthropic/claude-opus-5')).toBe(true);
    expect(p.ownsModel('api-perplexity/sonar')).toBe(false);
    expect(p.models.some(m => m.id === 'api-openrouter/openai/gpt-5.6-sol')).toBe(true);
  });

  it('Perplexity: prefixed catalog incl. sonar, owns its namespace', () => {
    const p = new PerplexityApiProvider(cfg);
    expect(p.name).toBe('perplexity-api');
    expect(p.models.some(m => m.id === 'api-perplexity/sonar')).toBe(true);
    expect(p.models.every(m => m.id.startsWith('api-perplexity/'))).toBe(true);
    expect(p.ownsModel('api-perplexity/openai/gpt-5.6-sol')).toBe(true);
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

  it('Grok CLI: prefixed seed catalog, owns its namespace', () => {
    const p = new GrokCliProvider(cfg);
    expect(p.name).toBe('cli-grok');
    // Seed list before discovery — deliberately not a pinned generation.
    expect(p.models.length).toBeGreaterThan(0);
    expect(p.models.every(m => m.id.startsWith('cli-grok/'))).toBe(true);
    expect(p.ownsModel('cli-grok/grok-3-mini')).toBe(true);
    expect(p.ownsModel('lmstudio/auto')).toBe(false);
  });

  it('Grok CLI: exposes refreshModels so /v1/models/refresh reaches it', () => {
    const p = new GrokCliProvider(cfg) as unknown as { refreshModels?: unknown };
    expect(typeof p.refreshModels).toBe('function');
  });

  it('Codex CLI: prefixed catalog, owns its namespace', () => {
    const p = new CodexCliProvider(cfg);
    expect(p.name).toBe('cli-codex');
    expect(p.models.some(m => m.id === 'cli-codex/gpt-5.6-sol')).toBe(true);
    expect(p.ownsModel('cli-codex/gpt-5.6-luna')).toBe(true);
    expect(p.ownsModel('cli-claude/claude-opus-5')).toBe(false);
  });

  it('Claude Code CLI: includes Fable 5 + Opus/Sonnet/Haiku', () => {
    const p = new ClaudeCliProvider(cfg);
    expect(p.name).toBe('cli-claude');
    expect(p.models.map(m => m.id)).toEqual(expect.arrayContaining([
      'cli-claude/claude-opus-5',
      'cli-claude/claude-sonnet-5',
      'cli-claude/claude-haiku-4-5',
      'cli-claude/claude-fable-5',
    ]));
    expect(p.ownsModel('cli-claude/claude-opus-5')).toBe(true);
  });

  it('Gemini CLI (agy): prefixed seed catalog, owns its namespace', () => {
    const p = new GeminiCliProvider(cfg);
    expect(p.name).toBe('cli-gemini');
    // Before discovery runs we advertise a seed list, not a pinned generation.
    expect(p.models.length).toBeGreaterThan(0);
    expect(p.models.every(m => m.id.startsWith('cli-gemini/'))).toBe(true);
    expect(p.ownsModel('cli-codex/gpt-5.6-sol')).toBe(false);
  });

  // The catalog is discovered from `agy models`, so a model released after this
  // build must still route rather than 404 on an id we never enumerated.
  it('Gemini CLI: routes any cli-gemini id, including ones not yet discovered', () => {
    const p = new GeminiCliProvider(cfg);
    expect(p.ownsModel('cli-gemini/gemini-3.7-flash-high')).toBe(true);
    expect(p.ownsModel('cli-gemini/some-unreleased-model-2027')).toBe(true);
  });

  it('Gemini CLI: exposes refreshModels so /v1/models/refresh reaches it', () => {
    const p = new GeminiCliProvider(cfg) as unknown as { refreshModels?: unknown };
    expect(typeof p.refreshModels).toBe('function');
  });
});

describe('registry routing', () => {
  const reg = new ProviderRegistry(cfg);

  it('routes exact catalog ids to the right provider', () => {
    expect(reg.providerForModel('api-openrouter/openai/gpt-5.6-sol')?.name).toBe('openrouter-api');
    expect(reg.providerForModel('api-perplexity/sonar')?.name).toBe('perplexity-api');
    expect(reg.providerForModel('cli-grok/grok-4.5')?.name).toBe('cli-grok');
    expect(reg.providerForModel('cli-codex/gpt-5.6-sol')?.name).toBe('cli-codex');
    expect(reg.providerForModel('cli-claude/claude-fable-5')?.name).toBe('cli-claude');
    expect(reg.providerForModel('cli-gemini/gemini-3.6-flash-high')?.name).toBe('cli-gemini');
    expect(reg.providerForModel('lmstudio/auto')?.name).toBe('lmstudio');
  });

  it('routes passthrough ids not in the curated catalog', () => {
    expect(reg.providerForModel('api-openrouter/some/unlisted-model')?.name).toBe('openrouter-api');
    expect(reg.providerForModel('api-perplexity/anything-goes')?.name).toBe('perplexity-api');
    expect(reg.providerForModel('lmstudio/llama-3.1-8b-instruct')?.name).toBe('lmstudio');
    expect(reg.providerForModel('cli-grok/grok-9-future')?.name).toBe('cli-grok');
    expect(reg.providerForModel('cli-codex/some-future')?.name).toBe('cli-codex');
    expect(reg.providerForModel('cli-claude/some-future')?.name).toBe('cli-claude');
    expect(reg.providerForModel('cli-gemini/some-future')?.name).toBe('cli-gemini');
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
    expect(ids.some(i => i.startsWith('cli-codex/'))).toBe(true);
    expect(ids.some(i => i.startsWith('cli-claude/'))).toBe(true);
    expect(ids.some(i => i.startsWith('cli-gemini/'))).toBe(true);
  });
});

describe('cli message flattening', () => {
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
