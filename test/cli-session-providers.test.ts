import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const state = vi.hoisted(() => ({ directory: '' }));
vi.mock('../src/config.js', async original => ({ ...await original<typeof import('../src/config.js')>(), runtimeDir: () => state.directory }));
vi.mock('../src/providers/cli-util.js', async original => ({ ...await original<typeof import('../src/providers/cli-util.js')>(), runCli: vi.fn(), resolveCliExecutable: (_cfg: unknown, provider: string) => ({ path: provider === 'cli-gemini' ? '/fixture/agy.exe' : `/fixture/${provider}.exe` }), agentCwd: () => state.directory }));
import { runCli } from '../src/providers/cli-util.js';
import { ClaudeCliProvider } from '../src/providers/cli-claude.js';
import { CodexCliProvider } from '../src/providers/cli-codex.js';
import { GeminiCliProvider } from '../src/providers/cli-gemini.js';
import type { ChatRequest } from '../src/types.js';
const cfg = { host: '127.0.0.1', port: 0, apiKeys: {}, logLevel: 'silent' as const }; const sessionId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'conduit-provider-session-')); vi.mocked(runCli).mockReset();
  vi.mocked(runCli).mockImplementation(async options => {
    const stdout = options.label === 'cli-claude' ? JSON.stringify({ type: 'result', result: 'answer', session_id: sessionId }) : options.label === 'cli-codex' ? JSON.stringify({ type: 'thread.started', thread_id: sessionId }) + '\n' + JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }) : JSON.stringify({ event: 'init', session_id: sessionId }) + '\n' + JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'answer' } });
    return { stdout, stderr: '', exitCode: 0, timedOut: false, aborted: false };
  });
});
afterEach(() => rmSync(state.directory, { recursive: true, force: true }));
it.each([
  ['cli-claude/claude-sonnet-5', ClaudeCliProvider, '--resume'],
  ['cli-codex/gpt-5.6-sol', CodexCliProvider, 'resume'],
  ['cli-gemini/gemini-3.8-flash-low', GeminiCliProvider, '--conversation'],
] as const)('resumes %s with only the new input and explicit native session ID', async (model, Provider, resumeFlag) => {
  const provider = new Provider(cfg); const request: ChatRequest = { model, cliSessionKey: 'owner/conversation', mode: 'chat', messages: [{ role: 'user', content: 'first turn' }] };
  expect(await provider.chat(request)).toBe('answer');
  request.messages.push({ role: 'assistant', content: 'answer' }, { role: 'user', content: 'second turn' });
  expect(await new Provider(cfg).chat(request)).toBe('answer');
  const resumed = vi.mocked(runCli).mock.calls[1][0]; expect(resumed.args).toContain(resumeFlag); expect(resumed.args).toContain(sessionId);
  expect(resumed.stdin).toContain('second turn'); expect(resumed.stdin).not.toContain('first turn'); expect(resumed.args.some(arg => /["\r\n]/.test(arg))).toBe(false);
  if (model.startsWith('cli-codex')) { expect(resumed.args).toContain('sandbox_mode=read-only'); expect(resumed.args).not.toContain('--ephemeral'); expect(resumed.args).not.toContain('--dangerously-bypass-approvals-and-sandbox'); }
});
it('invalidates a failed retained turn without retrying and preserves stateless Codex flags', async () => {
  const provider = new CodexCliProvider(cfg); const request: ChatRequest = { model: 'cli-codex/gpt-5.6-sol', cliSessionKey: 'owner/conversation', messages: [{ role: 'user', content: 'first' }] };
  vi.mocked(runCli).mockResolvedValueOnce({ stdout: '', stderr: 'session not found', exitCode: 1, timedOut: false, aborted: false }); await expect(provider.chat(request)).rejects.toThrow(); expect(runCli).toHaveBeenCalledTimes(1);
  await provider.chat(request); expect(vi.mocked(runCli).mock.calls[1][0].args).not.toContain('resume');
  rmSync(join(state.directory, 'cli-sessions.json')); await provider.chat({ ...request, cliSessionKey: undefined });
  expect(vi.mocked(runCli).mock.calls[2][0].args).toContain('--ephemeral'); expect(existsSync(join(state.directory, 'cli-sessions.json'))).toBe(false);
});
