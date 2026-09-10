import { describe, expect, it } from 'vitest';
import {
  agentConfinement,
  agentConfinementError,
  cliPermissionArgs,
  isAgentModeAllowed,
  unconfinedAgentProviders,
} from '../src/cli-mode.js';

/**
 * Agent mode launches three of the four providers with their own permission
 * check switched off. Only cli-codex keeps a real write boundary. That is a
 * deliberate policy choice and is not changed here; what is asserted is that
 * the reported confinement and the flags actually handed to the binary agree,
 * so the two cannot drift apart and leave the report lying.
 */

describe('agentConfinement matches the flags actually passed', () => {
  it('reports a boundary only where the flags create one', () => {
    expect(agentConfinement('cli-codex')).toBe('workspace');
    expect(agentConfinement('cli-claude')).toBe('none');
    expect(agentConfinement('cli-gemini')).toBe('none');
    expect(agentConfinement('cli-grok')).toBe('none');
  });

  it('the confined provider really gets a sandbox flag', () => {
    // If this stops holding, the classification above became a lie.
    expect(cliPermissionArgs('cli-codex', 'agent').join(' ')).toContain('--sandbox');
  });

  it('the unconfined providers really get a bypass flag', () => {
    // Each of these is what makes the classification "none" true.
    expect(cliPermissionArgs('cli-claude', 'agent').join(' ')).toContain('bypassPermissions');
    expect(cliPermissionArgs('cli-gemini', 'agent').join(' ')).toContain('dangerously-skip-permissions');
    expect(cliPermissionArgs('cli-grok', 'agent').join(' ')).toContain('always-approve');
  });

  it('control: chat mode is not agent mode, and is not classified here', () => {
    // Without this the assertions above could pass on a function that returns
    // "none" for everything in every mode.
    expect(cliPermissionArgs('cli-codex', 'chat').join(' ')).toContain('read-only');
  });
});

describe('unconfinedAgentProviders', () => {
  it('names the providers a user should be warned about', () => {
    expect(unconfinedAgentProviders(['cli-codex', 'cli-claude', 'cli-grok']).sort())
      .toEqual(['cli-claude', 'cli-grok']);
  });

  it('ignores names that are not CLI providers at all', () => {
    // The status list carries API and local providers too; they do not run
    // through cliPermissionArgs and must not appear in a warning about it.
    expect(unconfinedAgentProviders(['api-openrouter', 'lmstudio', 'cli-codex'])).toEqual([]);
  });

  it('control: an all-confined list produces no warning', () => {
    expect(unconfinedAgentProviders(['cli-codex'])).toEqual([]);
  });
});

describe('agentConfinementError and isAgentModeAllowed', () => {
  it('allows confined provider (cli-codex) in agent mode without opt-in', () => {
    expect(agentConfinementError('cli-codex', 'agent')).toBeUndefined();
    expect(isAgentModeAllowed('cli-codex')).toBe(true);
    expect(isAgentModeAllowed('cli-codex', { agentEnabled: true })).toBe(true);
  });

  it('blocks unconfined providers in agent mode by default', () => {
    for (const provider of ['cli-claude', 'cli-gemini', 'cli-grok'] as const) {
      const err = agentConfinementError(provider, 'agent');
      expect(err).toBeDefined();
      expect(err).toContain(`Agent mode is blocked for unconfined provider '${provider}'`);
      expect(err).toContain('Pass --allow-unconfined or configure allowUnconfined to permit.');
      expect(isAgentModeAllowed(provider)).toBe(false);
      expect(isAgentModeAllowed(provider, { agentEnabled: true })).toBe(false);
    }
  });

  it('permits unconfined providers in agent mode when allowUnconfined is true', () => {
    for (const provider of ['cli-claude', 'cli-gemini', 'cli-grok'] as const) {
      expect(agentConfinementError(provider, 'agent', { allowUnconfined: true })).toBeUndefined();
      expect(isAgentModeAllowed(provider, { allowUnconfined: true })).toBe(true);
      expect(isAgentModeAllowed(provider, { agentEnabled: true, allowUnconfined: true })).toBe(true);
    }
  });

  it('refuses agent mode when agentEnabled is explicitly false even with allowUnconfined', () => {
    expect(isAgentModeAllowed('cli-codex', { agentEnabled: false })).toBe(false);
    expect(isAgentModeAllowed('cli-claude', { agentEnabled: false, allowUnconfined: true })).toBe(false);
    expect(isAgentModeAllowed('cli-grok', { agentEnabled: false, allowUnconfined: true })).toBe(false);
  });

  it('never blocks chat or plan mode regardless of confinement', () => {
    for (const provider of ['cli-claude', 'cli-gemini', 'cli-grok', 'cli-codex'] as const) {
      expect(agentConfinementError(provider, 'chat')).toBeUndefined();
      expect(agentConfinementError(provider, 'plan')).toBeUndefined();
    }
  });

  it('ignores non-CLI providers', () => {
    expect(agentConfinementError('api-openrouter', 'agent')).toBeUndefined();
    expect(agentConfinementError('lmstudio', 'agent')).toBeUndefined();
    expect(isAgentModeAllowed('api-openrouter')).toBe(true);
  });
});
