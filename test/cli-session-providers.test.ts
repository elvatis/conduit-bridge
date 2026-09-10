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
it('streams Codex command evidence while returning only the final public response', async () => {
  const events: unknown[] = [];
  vi.mocked(runCli).mockImplementationOnce(async options => {
    expect(options.args).toContain('--json');
    expect(options.args).toContain('--ephemeral');
    const stdout = JSON.stringify({ type:'item.completed', item:{id:'c1',type:'command_execution',command:'npm test',aggregated_output:'pass',exit_code:0,status:'completed'} }) + '\n' + JSON.stringify({type:'item.completed',item:{id:'m1',type:'agent_message',text:'Verified'}});
    options.onStdout!(stdout.slice(0,45)); options.onStdout!(stdout.slice(45));
    return {stdout,stderr:'',exitCode:0,timedOut:false,aborted:false};
  });
  expect(await new CodexCliProvider(cfg).chat({model:'cli-codex/gpt-5.6-sol',messages:[{role:'user',content:'Verify'}],onExecutionEvent:event => events.push(event)})).toBe('Verified');
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({kind:'command',command:'npm test',combinedOutput:'pass',exitCode:0});
});
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
it.each([
  ['cli-codex/gpt-5.6-sol', CodexCliProvider],
  ['cli-claude/claude-opus-5', ClaudeCliProvider],
] as const)('passes speed separately from effort on initial and retained %s turns', async (model, Provider) => {
  const provider = new Provider(cfg);
  const request: ChatRequest = {model,cliSessionKey:'fast-conversation',effort:'high',fastMode:true,messages:[{role:'user',content:'First'}]};
  await provider.chat(request);
  request.fastMode = false; request.messages.push({role:'assistant',content:'answer'},{role:'user',content:'Next'});
  await provider.chat(request);
  const [initial,resumed] = vi.mocked(runCli).mock.calls.map(call => call[0].args);
  if (model.startsWith('cli-codex')) {
    expect(initial).toContain('service_tier=fast'); expect(resumed).toContain('service_tier=default');
    expect(resumed).toContain('model_reasoning_effort=high');
  } else {
    expect(initial[initial.indexOf('--settings')+1]).toBe('{"fastMode":true}');
    expect(resumed[resumed.indexOf('--settings')+1]).toBe('{"fastMode":false}');
    expect(resumed[resumed.indexOf('--effort')+1]).toBe('high');
  }
});

it('invalidates a failed retained turn without retrying and preserves stateless Codex flags', async () => {
  const provider = new CodexCliProvider(cfg); const request: ChatRequest = { model: 'cli-codex/gpt-5.6-sol', cliSessionKey: 'owner/conversation', messages: [{ role: 'user', content: 'first' }] };
  vi.mocked(runCli).mockResolvedValueOnce({ stdout: '', stderr: 'session not found', exitCode: 1, timedOut: false, aborted: false }); await expect(provider.chat(request)).rejects.toThrow(); expect(runCli).toHaveBeenCalledTimes(1);
  await provider.chat(request); expect(vi.mocked(runCli).mock.calls[1][0].args).not.toContain('resume');
  rmSync(join(state.directory, 'cli-sessions.json')); await provider.chat({ ...request, cliSessionKey: undefined });
  expect(vi.mocked(runCli).mock.calls[2][0].args).toContain('--ephemeral'); expect(existsSync(join(state.directory, 'cli-sessions.json'))).toBe(false);
});
