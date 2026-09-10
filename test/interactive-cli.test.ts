import { describe, expect, it } from 'vitest';
import {
  parseChatCommand,
  parseSseChunk,
  preferredChatModel,
  runInteractiveChat,
  type ChatTurnClient,
} from '../src/interactive-cli.js';
import {
  applyTuiKey,
  decodeKey,
  enrichModel,
  fuzzyMatch,
  renderTui,
  type TuiState,
} from '../src/tui-render.js';

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
    workspaces: [{ id: 'ws-1', name: 'conduit-workspace', path: '~/dev/conduit-bridge', isDefault: true }],
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
    expect(parseChatCommand('/run build the project')).toEqual({ type: 'run', prompt: 'build the project' });
    expect(parseChatCommand('/continue continue with tests')).toEqual({ type: 'continue', prompt: 'continue with tests' });
    expect(parseChatCommand('/continue run-101 add more tests')).toEqual({ type: 'continue', runId: 'run-101', prompt: 'add more tests' });
    expect(parseChatCommand('/approve')).toEqual({ type: 'approve', runId: undefined });
    expect(parseChatCommand('/approve run-101')).toEqual({ type: 'approve', runId: 'run-101' });
    expect(parseChatCommand('/cancel')).toEqual({ type: 'cancel', runId: undefined });
    expect(parseChatCommand('/cancel run-101')).toEqual({ type: 'cancel', runId: 'run-101' });
    expect(parseChatCommand('/workspaces')).toEqual({ type: 'workspaces' });
    expect(parseChatCommand('/insights')).toEqual({ type: 'insights' });
    expect(parseChatCommand('/status')).toEqual({ type: 'status' });
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

  it('renders a split 3-zone layout with navigation tree and main pane in wide terminals', () => {
    const frame = renderTui(baseState({ width: 90, height: 26 }));
    expect(frame).toContain('Chat Sessions');
    expect(frame).toContain('Agent Runs');
    expect(frame).toContain('WORKSPACES');
    expect(frame).toContain('Local Insights');
    expect(frame).toContain('Git');
    expect(frame).toContain('│');
  });

  it('displays live thinking spinner with elapsed timer and tool execution breadcrumbs during inference', () => {
    const frame = renderTui(baseState({
      busy: true,
      busyStartTime: Date.now() - 1420,
      spinnerFrame: 2,
      currentTool: { name: 'bash', target: 'npm test', status: 'running' },
    }));
    expect(frame).toContain('Thinking (');
    expect(frame).toContain('⚡ Executing tool: bash (npm test)');
  });

  it('fuzzy-filters models and renders rich metadata badges (CLI, Local, API)', () => {
    const frame = renderTui(baseState({
      overlay: 'models',
      filter: 'codex',
      models: [
        { id: 'cli-codex/orchestrator' },
        { id: 'bitnet/1.58b' },
        { id: 'claude-3-5-sonnet' },
      ],
    }));
    expect(frame).toContain('cli-codex/orchestrator');
    expect(frame).toContain('[CLI]');
    expect(frame).not.toContain('claude-3-5-sonnet');
  });

  it('renders Local Insights dashboard with categorized items', () => {
    const frame = renderTui(baseState({
      view: 'insights',
      width: 100,
      insights: [
        { id: 'i-1', kind: 'Architecture', text: 'Stateful session continuity preserves tool context' },
        { id: 'i-2', kind: 'Security', text: 'Fail-closed agent routing guards against credential leak' },
      ],
    }));
    expect(frame).toContain('Local Insights Dashboard');
    expect(frame).toContain('Architecture');
    expect(frame).toContain('Stateful session continuity');
    expect(frame).toContain('Fail-closed agent routing');
  });
});

describe('fuzzyMatch and enrichModel', () => {
  it('correctly matches substrings and subsequence characters', () => {
    expect(fuzzyMatch('cod', 'cli-codex/orchestrator')).toBe(true);
    expect(fuzzyMatch('bit', 'bitnet/auto')).toBe(true);
    expect(fuzzyMatch('cld', 'claude-3-sonnet')).toBe(true);
    expect(fuzzyMatch('xyz', 'claude-3-sonnet')).toBe(false);
  });

  it('enriches model with context limits, latency, and provider type badges', () => {
    const codex = enrichModel({ id: 'cli-codex/agent' });
    expect(codex.providerType).toBe('cli');
    expect(codex.contextWindow).toBe('128k');

    const bitnet = enrichModel({ id: 'bitnet/auto' });
    expect(bitnet.providerType).toBe('local');
    expect(bitnet.latency).toContain('instant');

    const claude = enrichModel({ id: 'claude-3-5-sonnet' });
    expect(claude.providerType).toBe('api');
    expect(claude.contextWindow).toBe('200k');
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

  it('cycles views with Tab key through chat, runs, workspaces, insights, git, help', () => {
    let s = baseState({ view: 'chat' });
    s = applyTuiKey(s, { type: 'tab' }).state;
    expect(s.view).toBe('runs');
    s = applyTuiKey(s, { type: 'tab' }).state;
    expect(s.view).toBe('workspaces');
    s = applyTuiKey(s, { type: 'tab' }).state;
    expect(s.view).toBe('insights');
    s = applyTuiKey(s, { type: 'tab' }).state;
    expect(s.view).toBe('git');
    s = applyTuiKey(s, { type: 'tab' }).state;
    expect(s.view).toBe('help');
    s = applyTuiKey(s, { type: 'tab' }).state;
    expect(s.view).toBe('chat');
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

  it('handles /run, /approve, and /continue commands', async () => {
    const createdRuns: Array<{ prompt: string; model?: string; mode?: string }> = [];
    const runActions: Array<{ id: string; action: string; feedback?: string }> = [];
    const toType = (str: string) => [...str].map(c => ({ type: 'char' as const, value: c }));

    const keys = [
      ...toType('/run test the build'),
      { type: 'enter' as const },
      ...toType('/approve'),
      { type: 'enter' as const },
      ...toType('/continue keep improving'),
      { type: 'enter' as const },
      { type: 'ctrl' as const, key: 'q' },
    ];

    await runInteractiveChat({
      client: {
        listModels: async () => [{ id: 'cli-codex/first' }],
        createSession: async model => ({ id: 'session-1', model }),
        listSessions: async () => [],
        getSession: async id => ({ id, title: 'CLI chat', model: 'cli-codex/first', messages: [] }),
        listRuns: async () => [{ id: 'run-42', status: 'waiting_approval', prompt: 'test the build' }],
        getRun: async id => ({
          id, status: 'waiting_approval', model: 'cli-codex/first', prompt: 'test the build',
          createdAt: Date.now(), costUsd: 0, tokensConsumed: 10, steps: [],
        }),
        createRun: async (prompt, model, mode) => {
          createdRuns.push({ prompt, model, mode });
          return { id: 'run-42' };
        },
        runAction: async (id, action, feedback) => {
          runActions.push({ id, action, feedback });
        },
        listWorkspaces: async () => [{ id: 'ws-1', name: 'default', path: '/repo', isDefault: true }],
        gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
        status: async () => ({ version: '0.10.0', providers: [] }),
        send: async () => 'ok',
        cancel: async () => {},
      },
      terminal: {
        columns: 80, rows: 24, color: true,
        write: () => {},
        readKey: async () => keys.shift() ?? null,
      },
    });

    expect(createdRuns).toEqual([{ prompt: 'test the build', model: 'cli-codex/first', mode: 'agent' }]);
    expect(runActions).toEqual([
      { id: 'run-42', action: 'approve', feedback: undefined },
      { id: 'run-42', action: 'continue', feedback: 'keep improving' },
    ]);
  });

  it('supports runs view navigation and keyboard shortcuts [Enter, A, C, X]', async () => {
    const runActions: Array<{ id: string; action: string; feedback?: string }> = [];
    const inspected: string[] = [];

    const keys = [
      { type: 'ctrl' as const, key: 'r' }, // open runs view
      { type: 'char' as const, value: 'a' }, // approve
      { type: 'enter' as const }, // view run detail
      { type: 'char' as const, value: 'c' }, // continue from detail
      { type: 'escape' as const }, // back to runs view
      { type: 'char' as const, value: 'x' }, // cancel run
      { type: 'ctrl' as const, key: 'q' }, // quit
    ];

    await runInteractiveChat({
      client: {
        listModels: async () => [{ id: 'cli-codex/first' }],
        createSession: async model => ({ id: 'session-1', model }),
        listSessions: async () => [],
        getSession: async id => ({ id, title: 'CLI chat', model: 'cli-codex/first', messages: [] }),
        listRuns: async () => [{ id: 'run-99', status: 'waiting_approval', prompt: 'deploy service' }],
        getRun: async id => {
          inspected.push(id);
          return {
            id, status: 'waiting_approval', model: 'cli-codex/first', prompt: 'deploy service',
            createdAt: Date.now(), costUsd: 0.05, tokensConsumed: 500,
            steps: [{ iteration: 1, status: 'completed', content: 'Checked env' }],
          };
        },
        createRun: async () => ({ id: 'run-99' }),
        runAction: async (id, action, feedback) => {
          runActions.push({ id, action, feedback });
        },
        listWorkspaces: async () => [{ id: 'ws-1', name: 'default', path: '/repo' }],
        gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
        status: async () => ({ version: '0.10.0', providers: [] }),
        send: async () => 'ok',
        cancel: async () => {},
      },
      terminal: {
        columns: 80, rows: 24, color: true,
        write: () => {},
        readKey: async () => keys.shift() ?? null,
      },
    });

    expect(inspected).toEqual(['run-99', 'run-99']);
    expect(runActions).toEqual([
      { id: 'run-99', action: 'approve', feedback: undefined },
      { id: 'run-99', action: 'continue', feedback: 'Continue execution' },
      { id: 'run-99', action: 'cancel', feedback: undefined },
    ]);
  });

  it('navigates to Local Insights via /insights command and displays extracted report', async () => {
    const toType = (str: string) => [...str].map(c => ({ type: 'char' as const, value: c }));
    const frames: string[] = [];

    const keys = [
      ...toType('/insights'),
      { type: 'enter' as const },
      { type: 'ctrl' as const, key: 'q' },
    ];

    await runInteractiveChat({
      client: {
        listModels: async () => [{ id: 'cli-codex/first' }],
        createSession: async model => ({ id: 'session-1', model }),
        listSessions: async () => [],
        getSession: async id => ({ id, title: 'CLI chat', model: 'cli-codex/first', messages: [] }),
        listRuns: async () => [],
        listWorkspaces: async () => [{ id: 'ws-1', name: 'default', path: '/repo' }],
        gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
        listInsights: async () => [
          { id: 'ins-1', kind: 'Architecture', text: 'Decoupled session state with persistent store' },
        ],
        status: async () => ({ version: '0.10.0', providers: [] }),
        send: async () => 'ok',
        cancel: async () => {},
      },
      terminal: {
        columns: 85, rows: 24, color: true,
        write: frame => { frames.push(frame); },
        readKey: async () => keys.shift() ?? null,
      },
    });

    const output = frames.join('');
    expect(output).toContain('Local Insights Dashboard');
    expect(output).toContain('Decoupled session state');
  });
});
