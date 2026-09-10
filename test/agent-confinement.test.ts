import { describe, expect, it } from 'vitest';
import { agentConfinement, cliPermissionArgs, unconfinedAgentProviders } from '../src/cli-mode.js';

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
