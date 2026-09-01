import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/registry.js';
import {
  BaseProvider,
  identitiesDiffer,
  manualLoginContextOptions,
  manualLoginPlaywrightArgs,
  resolveLaunchArgs,
  resolveSandboxOption,
  restoreContextOptions,
  sandboxOptedOut,
  stripQuery,
} from '../src/providers/base.js';
import { OpenRouterApiProvider } from '../src/providers/openrouter-api.js';
import { PerplexityApiProvider } from '../src/providers/perplexity-api.js';
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

  it('Grok CLI: prefixed catalog, owns its namespace', () => {
    const p = new GrokCliProvider(cfg);
    expect(p.name).toBe('grok-cli');
    expect(p.models.some(m => m.id === 'cli-grok/grok-4.5')).toBe(true);
    expect(p.models.every(m => m.id.startsWith('cli-grok/'))).toBe(true);
    expect(p.ownsModel('cli-grok/grok-3-mini')).toBe(true);
    expect(p.ownsModel('lmstudio/auto')).toBe(false);
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

  it('Gemini CLI (agy): prefixed catalog, owns its namespace', () => {
    const p = new GeminiCliProvider(cfg);
    expect(p.name).toBe('cli-gemini');
    expect(p.models.some(m => m.id === 'cli-gemini/gemini-3.6-flash-high')).toBe(true);
    expect(p.ownsModel('cli-gemini/gemini-3.5-flash-medium')).toBe(true);
    expect(p.ownsModel('cli-codex/gpt-5.6-sol')).toBe(false);
  });
});

describe('registry routing', () => {
  const reg = new ProviderRegistry(cfg);

  it('routes exact catalog ids to the right provider', () => {
    expect(reg.providerForModel('api-openrouter/openai/gpt-5.6-sol')?.name).toBe('openrouter-api');
    expect(reg.providerForModel('api-perplexity/sonar')?.name).toBe('perplexity-api');
    expect(reg.providerForModel('cli-grok/grok-4.5')?.name).toBe('grok-cli');
    expect(reg.providerForModel('cli-codex/gpt-5.6-sol')?.name).toBe('cli-codex');
    expect(reg.providerForModel('cli-claude/claude-fable-5')?.name).toBe('cli-claude');
    expect(reg.providerForModel('cli-gemini/gemini-3.6-flash-high')?.name).toBe('cli-gemini');
    expect(reg.providerForModel('lmstudio/auto')?.name).toBe('lmstudio');
  });

  it('routes passthrough ids not in the curated catalog', () => {
    expect(reg.providerForModel('api-openrouter/some/unlisted-model')?.name).toBe('openrouter-api');
    expect(reg.providerForModel('api-perplexity/anything-goes')?.name).toBe('perplexity-api');
    expect(reg.providerForModel('lmstudio/llama-3.1-8b-instruct')?.name).toBe('lmstudio');
    expect(reg.providerForModel('cli-grok/grok-9-future')?.name).toBe('grok-cli');
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

describe('BaseProvider._looksLoggedOut URL sanitization', () => {
  class TestWebProvider extends BaseProvider {
    readonly name = 'grok' as const;
    readonly loginUrl = 'https://grok.com';
    readonly verifySelector = '.ProseMirror';
    readonly models = [];
    async chat(): Promise<string> { return ''; }
    async *chatStream(): AsyncGenerator<string> { yield ''; }
    testLooksLoggedOut(url: string): boolean { return this._looksLoggedOut(url); }
  }

  const p = new TestWebProvider(cfg);

  it('detects standard login, signin, and auth URLs', () => {
    expect(p.testLooksLoggedOut('https://accounts.google.com/signin/v2')).toBe(true);
    expect(p.testLooksLoggedOut('https://auth.openai.com/authorize')).toBe(true);
    expect(p.testLooksLoggedOut('https://sub.accounts.google.com/oauth')).toBe(true);
    expect(p.testLooksLoggedOut('https://x.com/i/flow/login')).toBe(true);
  });

  it('rejects legitimate non-auth URLs and attack subpaths', () => {
    expect(p.testLooksLoggedOut('https://example.com/search?q=accounts.google.com')).toBe(false);
    expect(p.testLooksLoggedOut('https://gemini.google.com/app')).toBe(false);
    expect(p.testLooksLoggedOut('https://chatgpt.com/')).toBe(false);
    expect(p.testLooksLoggedOut('')).toBe(false);
  });
});

describe('login vs restore browser profiles', () => {
  // The manual login browser must not misrepresent itself. The historical
  // override claimed Windows and Chrome 131 while the process was Linux and
  // Chrome 151, contradicting the client hints Chromium sends alongside it.
  it('never overrides the identity of the manual login browser', () => {
    const options = manualLoginContextOptions(cfg);
    expect(options.userAgent).toBeUndefined();
    expect(options.locale).toBeUndefined();
    expect(options.timezoneId).toBeUndefined();
    // A null viewport means "use the real window size" rather than a fixed one
    // that never changes.
    expect(options.viewport).toBeNull();
    expect(JSON.stringify(options)).not.toContain('Windows');
  });

  it('adds no stealth arguments to the manual login browser', () => {
    const args = manualLoginPlaywrightArgs(cfg);
    for (const arg of args) {
      expect(arg).not.toContain('--disable-blink-features');
      expect(arg).not.toContain('user-agent');
    }
  });

  it('always keeps the browser native identity during restore', () => {
    const options = restoreContextOptions(cfg);
    expect(options.userAgent).toBeUndefined();
    expect(options.viewport).toBeNull();
    expect(identitiesDiffer(cfg)).toBe(false);
  });

  it('does not ask the restore browser to hide automation markers', () => {
    expect(resolveLaunchArgs(cfg)).not.toContain('--disable-blink-features=AutomationControlled');
    expect(resolveLaunchArgs(cfg)).not.toContain('--enable-automation');
  });

  it('requests the Chromium sandbox unless it is explicitly opted out', () => {
    expect(sandboxOptedOut(cfg)).toBe(false);
    expect(resolveSandboxOption(cfg)).toBe(true);
    expect(resolveLaunchArgs(cfg)).not.toContain('--no-sandbox');

    const optedOut = { ...cfg, chromiumNoSandbox: true };
    expect(sandboxOptedOut(optedOut)).toBe(true);
    expect(resolveSandboxOption(optedOut)).toBe(false);
    expect(resolveLaunchArgs(optedOut)).toContain('--no-sandbox');
    expect(manualLoginPlaywrightArgs(optedOut)).toContain('--no-sandbox');
  });

  it('strips query strings from anything that reaches diagnostics', () => {
    expect(stripQuery('https://claude.ai/login?token=abc&next=/x')).toBe('https://claude.ai/login');
    expect(stripQuery('https://claude.ai/new')).toBe('https://claude.ai/new');
    expect(stripQuery('')).toBe('');
    expect(stripQuery('https://x.example/' + 'a'.repeat(400)).length).toBeLessThanOrEqual(200);
  });
});

describe('BaseProvider login surface', () => {
  class TestWebProvider extends BaseProvider {
    readonly name = 'perplexity' as const;
    readonly loginUrl = 'https://www.perplexity.ai/';
    readonly verifySelector = 'textarea';
    readonly models = [];
    async chat(): Promise<string> { return ''; }
    async *chatStream(): AsyncGenerator<string> { yield ''; }
    testLooksChallenged(url: string): boolean { return this._looksChallenged(url); }
    setChallenge(verdict: 'ok' | 'verifying' | 'challenge_detected' | 'blocked'): void {
      (this as unknown as { _lastChallenge: { verdict: string } })._lastChallenge = { verdict };
    }
  }

  it('exposes a login driver with the observable surface, without a browser', () => {
    const provider = new TestWebProvider(cfg);
    const driver = provider.loginDriver();
    expect(driver.name).toBe('perplexity');
    expect(driver.loginUrl).toBe('https://www.perplexity.ai/');
    for (const method of ['openLoginBrowser', 'observeLoginBrowser', 'closeLoginBrowser', 'verifySession'] as const) {
      expect(typeof driver[method]).toBe('function');
    }
    expect(provider.loginActive).toBe(false);
    expect(provider.loginMode).toBe('handoff');
    expect(new TestWebProvider({ ...cfg, login: { mode: 'assisted' } }).loginMode).toBe('assisted');
  });

  it('treats a security check as unknown rather than an expired session', () => {
    const provider = new TestWebProvider(cfg);
    expect(provider.testLooksChallenged('https://www.perplexity.ai/')).toBe(false);
    for (const verdict of ['verifying', 'challenge_detected', 'blocked'] as const) {
      provider.setChallenge(verdict);
      expect(provider.testLooksChallenged('https://www.perplexity.ai/'), verdict).toBe(true);
    }
  });

  it('reuses one profile directory for the login browser and attached restore', () => {
    // The shared directory IS the mechanism by which a sign-in becomes a
    // restorable session; splitting it would make login succeed and restore fail.
    const provider = new TestWebProvider(cfg);
    expect(provider.profileDir).toBe('/tmp/conduit-test-profiles/perplexity-profile');
  });
});
