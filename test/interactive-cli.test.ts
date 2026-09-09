import { describe, expect, it } from 'vitest';
import {
  parseChatCommand,
  parseSseChunk,
  preferredChatModel,
  runInteractiveChat,
  type ChatTurnClient,
} from '../src/interactive-cli.js';

describe('parseChatCommand', () => {
  it('recognizes slash commands and leaves ordinary text as a prompt', () => {
    expect(parseChatCommand('/help')).toEqual({ type: 'help' });
    expect(parseChatCommand('/quit')).toEqual({ type: 'quit' });
    expect(parseChatCommand('/exit')).toEqual({ type: 'quit' });
    expect(parseChatCommand('/new')).toEqual({ type: 'new' });
    expect(parseChatCommand('/models')).toEqual({ type: 'models' });
    expect(parseChatCommand('/model')).toEqual({ type: 'models' });
    expect(parseChatCommand('/model cli-codex/gpt-5.6-sol')).toEqual({ type: 'model', id: 'cli-codex/gpt-5.6-sol' });
    expect(parseChatCommand('/stop')).toEqual({ type: 'stop' });
    expect(parseChatCommand('hello there')).toEqual({ type: 'prompt', text: 'hello there' });
    expect(parseChatCommand('   ')).toEqual({ type: 'empty' });
    expect(parseChatCommand('/unknown')).toEqual({ type: 'unknown', text: '/unknown' });
  });
});

describe('preferredChatModel', () => {
  it('prefers CLI then local then other advertised ids', () => {
    expect(preferredChatModel([
      { id: 'api-openrouter/x' },
      { id: 'lmstudio/auto' },
      { id: 'cli-codex/gpt-5.6-sol' },
    ])).toBe('cli-codex/gpt-5.6-sol');
    expect(preferredChatModel([{ id: 'bitnet/auto' }, { id: 'api-openrouter/x' }])).toBe('bitnet/auto');
  });
});

describe('parseSseChunk', () => {
  it('extracts delta text and ignores incomplete frames', () => {
    const first = parseSseChunk('data: {"type":"delta","delta":"Hi "}\n\ndata: {"type":"delta","delta":"there');
    expect(first.deltas).toEqual(['Hi ']);
    expect(first.rest).toContain('there');
    const second = parseSseChunk(first.rest + '"}\n\ndata: {"type":"done","assistantMessage":{"content":"Hi there"}}\n\n');
    expect(second.deltas).toEqual(['there']);
    expect(second.done?.assistantMessage?.content).toBe('Hi there');
  });
});

describe('runInteractiveChat', () => {
  it('creates a session, streams a reply, switches model, and quits', async () => {
    const output: string[] = [];
    const prompts = ['hello', '/model cli-codex/first', 'again', '/quit'];
    const sent: Array<{ sessionId: string; content: string; model: string }> = [];
    const client: ChatTurnClient = {
      listModels: async () => [{ id: 'cli-codex/first' }, { id: 'cli-claude/second' }],
      createSession: async model => ({ id: sent.length ? 'session-2' : 'session-1', model }),
      send: async (sessionId, content, model, _signal, onDelta) => {
        sent.push({ sessionId, content, model });
        onDelta?.('ok');
        return 'ok';
      },
      cancel: async () => {},
    };
    await runInteractiveChat({
      io: {
        write: text => { output.push(text); },
        prompt: async () => prompts.shift() ?? null,
      },
      client,
    });
    expect(sent).toEqual([
      { sessionId: 'session-1', content: 'hello', model: 'cli-claude/second' },
      { sessionId: 'session-1', content: 'again', model: 'cli-codex/first' },
    ]);
    const text = output.join('');
    expect(text).toContain('/help');
    expect(text).toContain('cli-codex/first');
    expect(text).toContain('cli-claude/second');
    expect(text).toContain('ok');
  });

  it('rejects an unknown model id without sending a turn', async () => {
    const output: string[] = [];
    const prompts = ['/model missing', '/quit'];
    let sends = 0;
    await runInteractiveChat({
      io: { write: text => output.push(text), prompt: async () => prompts.shift() ?? null },
      client: {
        listModels: async () => [{ id: 'cli-codex/first' }],
        createSession: async model => ({ id: 'session-1', model }),
        send: async () => { sends++; return 'no'; },
        cancel: async () => {},
      },
    });
    expect(sends).toBe(0);
    expect(output.join('')).toMatch(/unknown model/i);
  });
});
