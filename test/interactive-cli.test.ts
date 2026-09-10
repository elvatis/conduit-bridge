import { describe, expect, it } from 'vitest';
import {
  parseChatCommand,
  parseSseChunk,
  preferredChatModel,
  runInteractiveChat,
  type ChatTurnClient,
} from '../src/interactive-cli.js';
import { applyTuiKey, decodeKey, renderTui, type TuiState } from '../src/tui-render.js';

function baseState(over: Partial<TuiState> = {}): TuiState {
  return {
    view: 'chat',
    overlay: 'none',
    model: 'cli-codex/first',
    sessionId: 'session-1',
    sessionTitle: 'CLI chat',
    messages: [
      { role: 'user', content: 'Explain the failing test' },
      { role: 'assistant', content: 'The assertion compares the wrong field.', model: 'cli-codex/first' },
    ],
    input: '',
    cursor: 0,
    filter: '',
    selected: 0,
    models: [{ id: 'cli-codex/first' }, { id: 'cli-claude/second' }, { id: 'bitnet/auto' }],
    sessions: [{ id: 'session-1', title: 'CLI chat', model: 'cli-codex/first', updatedAt: 1 }],
    runs: [{ id: 'run-1', status: 'completed', model: 'cli-codex/first', prompt: 'Review the diff' }],
    git: { detected: true, branch: 'main', files: 3, name: 'conduit-bridge' },
    host: '127.0.0.1:31338',
    notice: 'Attached to existing listener',
    busy: false,
    streaming: '',
    width: 80,
    height: 24,
    ...over,
  };
}

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

describe('terminal workspace render', () => {
  it('paints a colored workspace with chat, status and shortcuts', () => {
    const frame = renderTui(baseState());
    expect(frame).toContain('\x1b[38;2;34;180;255m');
    expect(frame).toContain('\x1b[38;2;255;138;61m');
    expect(frame).toContain('CONDUIT');
    expect(frame).toContain('cli-codex/first');
    expect(frame).toContain('Explain the failing test');
    expect(frame).toContain('The assertion compares the wrong field.');
    expect(frame).toContain('Ctrl+K');
    expect(frame).toContain('main');
  });

  it('renders model, session and run pickers', () => {
    expect(renderTui(baseState({ overlay: 'models' }))).toContain('cli-claude/second');
    expect(renderTui(baseState({ overlay: 'sessions' }))).toContain('CLI chat');
    expect(renderTui(baseState({ view: 'runs' }))).toContain('Review the diff');
    expect(renderTui(baseState({ overlay: 'palette' }))).toContain('New conversation');
  });
});

describe('decodeKey', () => {
  it('maps arrows, enter, escape and workspace shortcuts', () => {
    expect(decodeKey('\r')).toEqual({ type: 'enter' });
    expect(decodeKey('\x1b')).toEqual({ type: 'escape' });
    expect(decodeKey('\x1b[A')).toEqual({ type: 'up' });
    expect(decodeKey('\x0b')).toEqual({ type: 'ctrl', key: 'k' });
    expect(decodeKey('\x0e')).toEqual({ type: 'ctrl', key: 'n' });
    expect(decodeKey('\x10')).toEqual({ type: 'ctrl', key: 'p' });
    expect(decodeKey('a')).toEqual({ type: 'char', value: 'a' });
  });
});

describe('applyTuiKey', () => {
  it('opens the palette, switches views and types into the composer', () => {
    let state = baseState();
    state = applyTuiKey(state, { type: 'ctrl', key: 'k' }).state;
    expect(state.overlay).toBe('palette');
    state = applyTuiKey(state, { type: 'escape' }).state;
    expect(state.overlay).toBe('none');
    state = applyTuiKey(state, { type: 'ctrl', key: 'p' }).state;
    expect(state.overlay).toBe('models');
    state = applyTuiKey(state, { type: 'escape' }).state;
    const typed = applyTuiKey(state, { type: 'char', value: 'h' }).state;
    expect(typed.input).toBe('h');
  });

  it('sends the composer on enter and quits from the palette', () => {
    const send = applyTuiKey(baseState({ input: 'hello' }), { type: 'enter' });
    expect(send.action).toBe('send');
    expect(send.state.input).toBe('');
    const palette = applyTuiKey(baseState(), { type: 'ctrl', key: 'k' }).state;
    const quit = applyTuiKey({ ...palette, filter: 'quit', selected: 0 }, { type: 'enter' });
    expect(quit.action).toBe('quit');
  });
});

describe('runInteractiveChat', () => {
  it('creates a session, streams a reply, switches model, and quits', async () => {
    const frames: string[] = [];
    const keys = [
      { type: 'char' as const, value: 'h' },
      { type: 'char' as const, value: 'i' },
      { type: 'enter' as const },
      { type: 'ctrl' as const, key: 'p' },
      { type: 'down' as const },
      { type: 'enter' as const },
      { type: 'ctrl' as const, key: 'q' },
    ];
    const sent: Array<{ sessionId: string; content: string; model: string }> = [];
    const client: ChatTurnClient = {
      listModels: async () => [{ id: 'cli-codex/first' }, { id: 'cli-claude/second' }],
      createSession: async model => ({ id: 'session-1', model }),
      listSessions: async () => [{ id: 'session-1', title: 'CLI chat', model: 'cli-codex/first', updatedAt: 1, messages: [] }],
      getSession: async id => ({ id, title: 'CLI chat', model: 'cli-codex/first', messages: [] }),
      listRuns: async () => [],
      gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
      status: async () => ({ version: '0.10.0', providers: [] }),
      send: async (sessionId, content, model, _signal, onDelta) => {
        sent.push({ sessionId, content, model });
        onDelta?.('ok');
        return 'ok';
      },
      cancel: async () => {},
    };
    await runInteractiveChat({
      client,
      terminal: {
        columns: 80,
        rows: 24,
        color: true,
        write: frame => { frames.push(frame); },
        readKey: async () => keys.shift() ?? null,
      },
    });
    expect(sent).toEqual([{ sessionId: 'session-1', content: 'hi', model: 'cli-claude/second' }]);
    const last = frames.at(-1) || '';
    expect(last).toContain('\x1b[38;2;34;180;255m');
    expect(last).toContain('ok');
  });

  it('rejects an unknown model id without sending a turn', async () => {
    const frames: string[] = [];
    const keys = [
      { type: 'char' as const, value: '/' },
      { type: 'char' as const, value: 'm' },
      { type: 'char' as const, value: 'o' },
      { type: 'char' as const, value: 'd' },
      { type: 'char' as const, value: 'e' },
      { type: 'char' as const, value: 'l' },
      { type: 'char' as const, value: ' ' },
      { type: 'char' as const, value: 'n' },
      { type: 'char' as const, value: 'o' },
      { type: 'char' as const, value: 'p' },
      { type: 'char' as const, value: 'e' },
      { type: 'enter' as const },
      { type: 'ctrl' as const, key: 'q' },
    ];
    let sends = 0;
    await runInteractiveChat({
      client: {
        listModels: async () => [{ id: 'cli-codex/first' }],
        createSession: async model => ({ id: 'session-1', model }),
        listSessions: async () => [],
        getSession: async id => ({ id, title: 'CLI chat', model: 'cli-codex/first', messages: [] }),
        listRuns: async () => [],
        gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
        status: async () => ({ version: '0.10.0', providers: [] }),
        send: async () => { sends++; return 'no'; },
        cancel: async () => {},
      },
      terminal: {
        columns: 80, rows: 24, color: true,
        write: frame => { frames.push(frame); },
        readKey: async () => keys.shift() ?? null,
      },
    });
    expect(sends).toBe(0);
    expect(frames.join('')).toMatch(/unknown model/i);
  });
});
