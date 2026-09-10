import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ openai:vi.fn(), normal:vi.fn(), fast:vi.fn(), normalStream:vi.fn(), fastStream:vi.fn() }));
vi.mock('openai',() => ({default:class {chat = {completions:{create:calls.openai}};}}));
vi.mock('@anthropic-ai/sdk',() => ({default:class {messages = {create:calls.normal,stream:calls.normalStream}; beta = {messages:{create:calls.fast,stream:calls.fastStream}};}}));
import { supportsFastMode, parseFastMode } from '../src/fast-mode.js';
import { CodexApiProvider } from '../src/providers/codex-api.js';
import { ClaudeApiProvider } from '../src/providers/claude-api.js';

const cfg = {host:'127.0.0.1',port:0,logLevel:'silent' as const,apiKeys:{'codex-api':'fixture','claude-api':'fixture'}};
const messages = [{role:'user' as const,content:'Hello'}];
beforeEach(() => {
  Object.values(calls).forEach(call => call.mockReset());
  calls.openai.mockImplementation(async body => body.stream ? (async function*() {yield {choices:[{delta:{content:'hello'}}]};})() : {choices:[{message:{content:'hello'}}]});
  calls.normal.mockResolvedValue({content:[{type:'text',text:'hello'}]}); calls.fast.mockResolvedValue({content:[{type:'text',text:'hello'}]});
  for (const call of [calls.normalStream,calls.fastStream]) call.mockImplementation(() => (async function*() {yield {type:'content_block_delta',delta:{type:'text_delta',text:'hello'}};})());
});

describe('provider Fast mode', () => {
  it('limits the option to supported models and validates boolean input', () => {
    expect(supportsFastMode('cli-codex','cli-codex/gpt-6-astra')).toBe(true);
    expect(supportsFastMode('codex-api','api-codex/text-embedding-3-small')).toBe(false);
    expect(supportsFastMode('cli-claude','cli-claude/second-account/claude-opus-5')).toBe(true);
    expect(supportsFastMode('claude-api','api-claude/claude-opus-4-7')).toBe(false);
    expect(supportsFastMode('cli-claude','cli-claude/claude-sonnet-5')).toBe(false);
    expect(supportsFastMode('cli-gemini','cli-gemini/gemini-3.8-flash')).toBe(false);
    expect(parseFastMode(false)).toBe(false); expect(() => parseFastMode('true')).toThrow('boolean');
  });

  it('sends independent OpenAI service tier on regular and streamed calls, including explicit off', async () => {
    const provider = new CodexApiProvider(cfg);
    const request = {model:'api-codex/gpt-5.6-sol',messages,effort:'high',fastMode:true};
    expect(await provider.chat(request)).toBe('hello');
    expect(calls.openai.mock.calls[0][0]).toMatchObject({model:'gpt-5.6-sol',reasoning_effort:'high',service_tier:'priority'});
    expect((await Array.fromAsync(provider.chatStream({...request,fastMode:false}))).join('')).toBe('hello');
    expect(calls.openai.mock.calls[1][0]).toMatchObject({reasoning_effort:'high',service_tier:'default',stream:true});
  });

  it('uses the Claude fast beta only for opted-in supported models without replacing the model', async () => {
    const provider = new ClaudeApiProvider(cfg);
    const request = {model:'api-claude/claude-opus-5',messages,effort:'high',fastMode:true};
    expect(await provider.chat(request)).toBe('hello');
    expect(calls.fast.mock.calls[0][0]).toMatchObject({model:'claude-opus-5',speed:'fast',betas:['fast-mode-2026-02-01'],output_config:{effort:'high'}});
    expect((await Array.fromAsync(provider.chatStream(request))).join('')).toBe('hello');
    expect(calls.fastStream).toHaveBeenCalledOnce();
    await provider.chat({...request,fastMode:false}); expect(calls.normal).toHaveBeenCalledOnce();
    await expect(provider.chat({...request,model:'api-claude/claude-sonnet-5'})).rejects.toThrow('not supported');
    expect(calls.fast).toHaveBeenCalledOnce();
  });
});
