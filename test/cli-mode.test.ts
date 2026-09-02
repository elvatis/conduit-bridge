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
  it('maps Claude chat to read-only tools, plan to the planner, agent to bypassPermissions', () => {
    expect(cliPermissionArgs('cli-claude', 'chat')).toEqual([
      '--disallowedTools', 'Write,Edit,NotebookEdit,Bash',
    ]);
    expect(cliPermissionArgs('cli-claude', 'plan')).toEqual(['--permission-mode', 'plan']);
    expect(cliPermissionArgs('cli-claude', 'agent')).toEqual(['--permission-mode', 'bypassPermissions']);
  });

  it('leaves agy in its default mode for chat, and only plans in plan mode', () => {
    expect(cliPermissionArgs('cli-gemini', 'chat', { isAgy: true })).toEqual([]);
    expect(cliPermissionArgs('cli-gemini', 'plan', { isAgy: true })).toEqual(['--mode', 'plan']);
    expect(cliPermissionArgs('cli-gemini', 'agent', { isAgy: true })).toEqual([
      '--mode', 'accept-edits',
      '--dangerously-skip-permissions',
    ]);
  });

  it('maps legacy gemini approval-mode plan, and drops it for chat and agent', () => {
    expect(cliPermissionArgs('cli-gemini', 'chat', { isAgy: false })).toEqual([]);
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

  it('maps Grok chat to read-only tools, plan to plan, agent to no-plan always-approve', () => {
    expect(cliPermissionArgs('cli-grok', 'chat')).toEqual([
      '--disallowed-tools', 'Write,Edit,NotebookEdit,Bash',
    ]);
    expect(cliPermissionArgs('cli-grok', 'plan')).toEqual(['--permission-mode', 'plan']);
    expect(cliPermissionArgs('cli-grok', 'agent')).toEqual(['--no-plan', '--always-approve']);
  });

  // The two CLIs spell the flag differently, and getting it wrong is silent in
  // unit tests but fatal at runtime: on grok, camelCase --disallowedTools is an
  // alias for --deny, which rejects NotebookEdit at parse time and exits 1, so
  // every default-mode grok request 503s.
  it('uses each CLI its own spelling of the deny-tools flag', () => {
    expect(cliPermissionArgs('cli-claude', 'chat')[0]).toBe('--disallowedTools');
    expect(cliPermissionArgs('cli-grok', 'chat')[0]).toBe('--disallowed-tools');
  });

  // The regression this suite previously pinned the wrong way round: chat and
  // plan produced identical flags, so an Ask turn was answered by a planner.
  it('never sends plan flags for a chat turn', () => {
    for (const provider of ['cli-claude', 'cli-gemini', 'cli-grok'] as const) {
      const chat = cliPermissionArgs(provider, 'chat', { isAgy: true });
      expect(chat, provider).not.toContain('plan');
      expect(chat, provider).not.toEqual(cliPermissionArgs(provider, 'plan', { isAgy: true }));
    }
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
