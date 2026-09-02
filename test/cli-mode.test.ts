import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  parseCliRunMode,
  agentModeCwdError,
  cliPermissionArgs,
} from '../src/cli-mode.js';

describe('parseCliRunMode', () => {
  it('defaults to chat when nothing is set', () => {
    expect(parseCliRunMode({})).toEqual({ ok: true, mode: 'chat' });
  });

  it('accepts mode chat, plan, and agent', () => {
    expect(parseCliRunMode({ mode: 'chat' })).toEqual({ ok: true, mode: 'chat' });
    expect(parseCliRunMode({ mode: 'PLAN' })).toEqual({ ok: true, mode: 'plan' });
    expect(parseCliRunMode({ mode: 'agent' })).toEqual({ ok: true, mode: 'agent' });
  });

  it('treats agentic: true as agent and plan: true as plan', () => {
    expect(parseCliRunMode({ agentic: true })).toEqual({ ok: true, mode: 'agent' });
    expect(parseCliRunMode({ plan: true })).toEqual({ ok: true, mode: 'plan' });
  });

  it('lets an explicit mode win over booleans', () => {
    expect(parseCliRunMode({ mode: 'plan', agentic: true })).toEqual({ ok: true, mode: 'plan' });
  });

  it('rejects unknown mode strings', () => {
    const result = parseCliRunMode({ mode: 'yolo' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/chat, plan, or agent/i);
  });

  it('rejects agentic and plan both true when mode is omitted', () => {
    const result = parseCliRunMode({ agentic: true, plan: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/agentic and plan/i);
  });
});

describe('agentModeCwdError', () => {
  it('requires an absolute existing cwd for agent mode', () => {
    expect(agentModeCwdError('chat', undefined)).toBeUndefined();
    expect(agentModeCwdError('plan', undefined)).toBeUndefined();
    expect(agentModeCwdError('agent', undefined)).toMatch(/cwd/i);
    expect(agentModeCwdError('agent', 'relative/path')).toMatch(/cwd/i);
    expect(agentModeCwdError('agent', join(homedir(), 'does-not-exist-agent-cwd-xyz'))).toMatch(/cwd/i);
    expect(agentModeCwdError('agent', process.cwd())).toBeUndefined();
  });
});

describe('cliPermissionArgs', () => {
  it('maps Claude plan and chat to permission-mode plan, agent to bypassPermissions', () => {
    expect(cliPermissionArgs('cli-claude', 'chat')).toEqual(['--permission-mode', 'plan']);
    expect(cliPermissionArgs('cli-claude', 'plan')).toEqual(['--permission-mode', 'plan']);
    expect(cliPermissionArgs('cli-claude', 'agent')).toEqual(['--permission-mode', 'bypassPermissions']);
  });

  it('maps agy plan/chat to --mode plan and agent to accept-edits with skip-permissions', () => {
    expect(cliPermissionArgs('cli-gemini', 'plan', { isAgy: true })).toEqual(['--mode', 'plan']);
    expect(cliPermissionArgs('cli-gemini', 'chat', { isAgy: true })).toEqual(['--mode', 'plan']);
    expect(cliPermissionArgs('cli-gemini', 'agent', { isAgy: true })).toEqual([
      '--mode', 'accept-edits',
      '--dangerously-skip-permissions',
    ]);
  });

  it('maps legacy gemini approval-mode plan, and drops it for agent', () => {
    expect(cliPermissionArgs('cli-gemini', 'plan', { isAgy: false })).toEqual(['--approval-mode', 'plan']);
    expect(cliPermissionArgs('cli-gemini', 'agent', { isAgy: false })).toEqual([]);
  });

  it('maps Codex plan/chat to read-only sandbox and agent to workspace-write', () => {
    expect(cliPermissionArgs('cli-codex', 'plan')).toEqual(['--sandbox', 'read-only', '--ephemeral']);
    expect(cliPermissionArgs('cli-codex', 'chat')).toEqual(['--sandbox', 'read-only', '--ephemeral']);
    expect(cliPermissionArgs('cli-codex', 'agent')).toEqual([
      '--sandbox', 'workspace-write',
      '--approve-for-me',
      '--ephemeral',
    ]);
  });

  it('maps Grok plan/chat to permission-mode plan and agent to no-plan always-approve', () => {
    expect(cliPermissionArgs('cli-grok', 'plan')).toEqual(['--permission-mode', 'plan']);
    expect(cliPermissionArgs('cli-grok', 'chat')).toEqual(['--permission-mode', 'plan']);
    expect(cliPermissionArgs('cli-grok', 'agent')).toEqual(['--no-plan', '--always-approve']);
  });
});

describe('CLI providers use the shared mapper', () => {
  it('imports cliPermissionArgs instead of hardcoding plan/agent flags', () => {
    const files = ['cli-claude.ts', 'cli-codex.ts', 'cli-gemini.ts', 'grok-cli.ts'];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), 'src/providers', file), 'utf8');
      expect(src, file).toContain('cliPermissionArgs');
    }
  });
});
