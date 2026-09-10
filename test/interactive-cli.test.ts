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
  estimateTokens,
  findNextWord,
  findPrevWord,
  formatTokenCount,
  fuzzyMatch,
  renderProgressBar,
  renderTui,
  renderTuiLines,
  stripAnsi,
  TuiDifferentialRenderer,
  type TuiState,
} from '../src/tui-render.js';
import { renderCliHelp } from '../src/cli-help.js';
import { loadConfig } from '../src/config.js';

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

describe('TuiDifferentialRenderer', () => {
  it('clears screen on initial frame or dimension change', () => {
    const renderer = new TuiDifferentialRenderer();
    const writes: string[] = [];
    const term = {
      columns: 80,
      rows: 5,
      write: (f: string) => writes.push(f),
    };

    renderer.render(term, ['line 1', 'line 2', 'line 3', 'line 4', 'line 5']);
    expect(writes.length).toBe(1);
    expect(writes[0]).toContain('\x1b[2J'); // full clear on initial frame
    expect(writes[0]).toContain('line 1');
    expect(writes[0]).toContain('line 5');
  });

  it('performs differential delta-line updates without clearing the screen when a line changes', () => {
    const renderer = new TuiDifferentialRenderer();
    const writes: string[] = [];
    const term = {
      columns: 80,
      rows: 4,
      write: (f: string) => writes.push(f),
    };

    // First frame
    renderer.render(term, ['header', 'body line 1', 'body line 2', 'footer']);
    writes.length = 0; // reset capture

    // Second frame: only line 4 (footer) changed
    renderer.render(term, ['header', 'body line 1', 'body line 2', 'footer modified'], { row: 4, col: 10 });
    expect(writes.length).toBe(1);
    expect(writes[0]).not.toContain('\x1b[2J'); // NO full screen clear!
    expect(writes[0]).toContain('\x1b[4;1H\x1b[2Kfooter modified'); // targeted line update!
    expect(writes[0]).toContain('\x1b[4;10H\x1b[?25h'); // cursor positioned at input!
  });

  it('resets buffer state cleanly on reset()', () => {
    const renderer = new TuiDifferentialRenderer();
    const writes: string[] = [];
    const term = { columns: 80, rows: 3, write: (f: string) => writes.push(f) };

    renderer.render(term, ['a', 'b', 'c']);
    renderer.reset();
    writes.length = 0;

    renderer.render(term, ['a', 'b', 'c']);
    expect(writes[0]).toContain('\x1b[2J'); // full clear again after reset
  });
});

describe('Inference State Machine & Telemetry', () => {
  it('renders thinking state with ms timer and model telemetry', () => {
    const state = baseState({
      busy: true,
      status: 'thinking',
      busyStartTime: Date.now() - 2500,
      spinnerFrame: 3,
    });
    const frame = renderTui(state);
    expect(frame).toContain('Thinking (');
    expect(frame).toContain('2500ms');
  });

  it('renders streaming state with token count and tokens per second rate', () => {
    const state = baseState({
      busy: true,
      status: 'streaming',
      streaming: 'Here is the generated analysis',
      tokenCount: 42,
      tokensPerSec: 38.5,
      busyStartTime: Date.now() - 1100,
      spinnerFrame: 1,
    });
    const frame = renderTui(state);
    expect(frame).toContain('streaming ·');
    expect(frame).toContain('42 tokens');
    expect(frame).toContain('38.5 t/s');
    expect(frame).toContain('Here is the generated analysis');
  });

  it('renders tool execution and diff mutation indicators', () => {
    const state = baseState({
      busy: true,
      status: 'diff_apply',
      currentTool: { name: 'patch', target: 'src/cli.ts', status: 'running' },
      busyStartTime: Date.now() - 500,
    });
    const frame = renderTui(state);
    expect(frame).toContain('Tool Invocation: patch (src/cli.ts)');
    expect(frame).toContain('Applying Diff / Workspace Mutation');
  });

  it('renders syntax-highlighted diff chunks in run-detail events', () => {
    const state = baseState({
      view: 'run-detail',
      selectedRunDetail: {
        id: 'run-99',
        status: 'completed',
        model: 'cli-claude/claude-sonnet-5',
        prompt: 'Fix type error in logger',
        createdAt: Date.now(),
        costUsd: 0.0012,
        tokensConsumed: 120,
        steps: [
          {
            iteration: 1,
            status: 'completed',
            events: [
              {
                kind: 'command',
                command: 'git diff',
                status: 'completed',
                exitCode: 0,
                stdout: '@@ -1,3 +1,4 @@\n-old code\n+new code\n unchanged',
              },
            ],
          },
        ],
      },
    });
    const frame = renderTui(state);
    expect(frame).toContain('Run Detail:');
    expect(frame).toContain('run-99');
    expect(frame).toContain('git diff');
    expect(frame).toContain('+new code');
    expect(frame).toContain('-old code');
  });
});

describe('renderCliHelp', () => {
  it('renders high-end ANSI help screen with 2-column commands, flags and verified providers', () => {
    const cfg = loadConfig();
    const help = renderCliHelp('0.10.0', cfg);

    expect(help).toContain('CONDUIT BRIDGE');
    expect(help).toContain('v0.10.0');
    expect(help).toContain('CORE COMMANDS:');
    expect(help).toContain('System & Service');
    expect(help).toContain('Agent Orchestration');
    expect(help).toContain('Workspaces & Models');
    expect(help).toContain('chat | tui');
    expect(help).toContain('FLAGS & OPTIONS:');
    expect(help).toContain('--port=');
    expect(help).toContain('--mode=');
    expect(help).toContain('--approval=');
    expect(help).toContain('SUPPORTED PROVIDERS:');
    expect(help).toContain('cli-gemini');
    expect(help).toContain('cli-claude');
    expect(help).toContain('cli-codex');
    expect(help).toContain('cli-grok');
    expect(help).toContain('claude-api');
    expect(help).toContain('lmstudio');
    expect(help).toContain('bitnet');
    expect(help).toContain('EXAMPLES:');
  });
});

describe('renderProgressBar', () => {
  it('renders filled and empty blocks with percentage representation', () => {
    const bar = renderProgressBar(50, 10);
    expect(bar).toContain('50%');
    expect(bar).toContain('█████');
    expect(bar).toContain('░░░░░');
  });

  it('clamps values below 0 and above 100', () => {
    const zero = renderProgressBar(-10, 8);
    expect(zero).toContain('0%');
    expect(zero).toContain('░░░░░░░░');

    const full = renderProgressBar(120, 8);
    expect(full).toContain('100%');
    expect(full).toContain('████████');
  });

  it('applies color transitions for green, yellow, and red thresholds', () => {
    const green = renderProgressBar(30, 8);
    expect(green).toContain('\x1b[38;2;63;185;80m'); // GREEN

    const yellow = renderProgressBar(75, 8);
    expect(yellow).toContain('\x1b[38;2;245;184;61m'); // YELLOW

    const red = renderProgressBar(95, 8);
    expect(red).toContain('\x1b[38;2;248;81;73m'); // RED
  });
});

describe('estimateTokens and formatTokenCount', () => {
  it('estimates prompt tokens accurately with heuristic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBe(0);
    const shortPrompt = estimateTokens('Hello world');
    expect(shortPrompt).toBeGreaterThanOrEqual(2);
    expect(shortPrompt).toBeLessThanOrEqual(4);

    const longTask = 'Audit codebase for race conditions and implement mutex lock across all worktrees';
    const est = estimateTokens(longTask);
    expect(est).toBeGreaterThanOrEqual(15);
    expect(est).toBeLessThanOrEqual(30);
  });

  it('formats token counts with k and M suffixes', () => {
    expect(formatTokenCount(140)).toBe('140');
    expect(formatTokenCount(950)).toBe('950');
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(42100)).toBe('42.1k');
    expect(formatTokenCount(128000)).toBe('128k');
    expect(formatTokenCount(1000000)).toBe('1M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });
});

describe('findPrevWord and findNextWord', () => {
  it('navigates word boundaries backwards and forwards', () => {
    const text = 'git commit -m "fix issue"';
    // cursor at end
    const prev1 = findPrevWord(text, text.length);
    expect(prev1).toBe(19); // start of 'issue'
    const prev2 = findPrevWord(text, prev1);
    expect(prev2).toBe(14); // start of '"fix'

    // cursor at start
    const next1 = findNextWord(text, 0);
    expect(next1).toBe(4); // after 'git '
    const next2 = findNextWord(text, next1);
    expect(next2).toBe(11); // after 'commit '
  });

  it('handles boundary edges gracefully', () => {
    expect(findPrevWord('hello', 0)).toBe(0);
    expect(findNextWord('hello', 5)).toBe(5);
  });
});

describe('Prompt History and Multi-Line Editing', () => {
  it('navigates history with Up and Down arrows and restores draft input', () => {
    let state = baseState({
      history: ['first prompt', 'second prompt', 'third prompt'],
      historyIndex: -1,
      input: 'my draft text',
      cursor: 13,
    });

    // Press Up: loads 'third prompt'
    let step = applyTuiKey(state, { type: 'up' });
    expect(step.state.input).toBe('third prompt');
    expect(step.state.historyIndex).toBe(0);
    expect(step.state.draftInput).toBe('my draft text');

    // Press Up again: loads 'second prompt'
    step = applyTuiKey(step.state, { type: 'up' });
    expect(step.state.input).toBe('second prompt');
    expect(step.state.historyIndex).toBe(1);

    // Press Down: returns to 'third prompt'
    step = applyTuiKey(step.state, { type: 'down' });
    expect(step.state.input).toBe('third prompt');
    expect(step.state.historyIndex).toBe(0);

    // Press Down again: restores draft input
    step = applyTuiKey(step.state, { type: 'down' });
    expect(step.state.input).toBe('my draft text');
    expect(step.state.historyIndex).toBe(-1);
  });

  it('stores executed prompts into history on enter', () => {
    let state = baseState({ input: 'new command', history: ['prev command'] });
    const res = applyTuiKey(state, { type: 'enter' });
    expect(res.action).toBe('send');
    expect(res.payload).toBe('new command');
    expect(res.state.history).toEqual(['prev command', 'new command']);
    expect(res.state.historyIndex).toBe(-1);
  });

  it('handles word-left and word-right navigation', () => {
    let state = baseState({ input: 'hello brave new world', cursor: 21 });
    state = applyTuiKey(state, { type: 'word-left' }).state;
    expect(state.cursor).toBe(16); // before 'world'
    state = applyTuiKey(state, { type: 'word-left' }).state;
    expect(state.cursor).toBe(12); // before 'new'
    state = applyTuiKey(state, { type: 'word-right' }).state;
    expect(state.cursor).toBe(16); // after 'new '
  });

  it('supports newline key (Shift+Enter / Alt+Enter) for multi-line inputs', () => {
    let state = baseState({ input: 'line 1', cursor: 6 });
    state = applyTuiKey(state, { type: 'newline' }).state;
    expect(state.input).toBe('line 1\n');
    expect(state.cursor).toBe(7);
  });
});

describe('Header Context Fill Bar & Live Pre-Execution Prompt Estimation', () => {
  it('renders context fill progressbar and ratio in header', () => {
    const frame = renderTui(baseState({
      contextTokens: 42100,
      contextWindowLimit: 128000,
    }));
    expect(frame).toContain('Ctx:');
    expect(frame).toContain('42.1k/128k');
  });

  it('displays live pre-execution prompt token estimation in footer when typing', () => {
    const frame = renderTui(baseState({
      input: 'Please inspect the failing tests and fix race conditions',
      cursor: 56,
      contextTokens: 12000,
      contextWindowLimit: 128000,
    }));
    expect(frame).toContain('Prompt: ~');
    expect(frame).toContain('tok');
    expect(frame).toContain('Projected:');
  });
});

describe('Human-In-The-Loop Approval Workflow', () => {
  it('renders approval card with step, action, and diff preview', () => {
    const frame = renderTui(baseState({
      width: 100,
      pendingApproval: {
        runId: 'run-77',
        stepId: 'step-2',
        stepName: 'Apply Patch',
        toolName: 'git apply',
        summary: 'Review changes before touching disk',
        diff: '--- a/src/index.ts\n+++ b/src/index.ts\n+const secure = true;\n-const secure = false;',
      },
    }));
    const plain = stripAnsi(frame);
    expect(plain).toContain('HUMAN-IN-THE-LOOP APPROVAL');
    expect(plain).toContain('Run run-77');
    expect(plain).toContain('Apply Patch');
    expect(plain).toContain('git apply');
    expect(plain).toContain('+const secure = true;');
    expect(plain).toContain('[y] Approve');
    expect(plain).toContain('[s] Skip step');
    expect(plain).toContain('[c] Abort');
  });

  it('triggers approve, continue, and abort actions from approval keys when input is empty', () => {
    const approvalState = baseState({
      pendingApproval: { runId: 'run-77', stepId: 'step-2' },
      input: '',
    });

    const approve = applyTuiKey(approvalState, { type: 'char', value: 'y' });
    expect(approve.action).toBe('approve-run');
    expect(approve.payload).toBe('run-77');

    const skip = applyTuiKey(approvalState, { type: 'char', value: 's' });
    expect(skip.action).toBe('continue-run');
    expect(skip.payload).toBe('run-77');

    const abort = applyTuiKey(approvalState, { type: 'char', value: 'x' });
    expect(abort.action).toBe('cancel-run');
    expect(abort.payload).toBe('run-77');

    const steer = applyTuiKey(approvalState, { type: 'char', value: 'e' });
    expect(steer.state.input).toContain('/continue run-77');
  });
});

describe('Multi-Step Task Runner Progress & Turn Metrics', () => {
  it('renders task runner progress in runs and run-detail views', () => {
    const frame = renderTui(baseState({
      width: 100,
      view: 'run-detail',
      selectedRunDetail: {
        id: 'run-10',
        status: 'running',
        model: 'cli-codex/first',
        prompt: 'Build and audit codebase',
        createdAt: Date.now(),
        costUsd: 0.012,
        tokensConsumed: 1200,
        steps: [
          { iteration: 1, status: 'completed' },
          { iteration: 2, status: 'running' },
          { iteration: 3, status: 'pending' },
        ],
      },
    }));
    expect(frame).toContain('Progress:');
    expect(frame).toContain('(1/3 steps)');
  });

  it('renders turn metrics breakdown under assistant responses', () => {
    const frame = renderTui(baseState({
      width: 100,
      messages: [
        { role: 'user', content: 'Run test suite' },
        {
          role: 'assistant',
          content: 'All 76 tests passed cleanly.',
          metrics: {
            inputTokens: 25,
            outputTokens: 110,
            totalTokens: 135,
            tokensPerSec: 45.2,
            turnCostUsd: 0.0018,
            costBudgetPercent: 2,
          },
        },
      ],
    }));
    expect(frame).toContain('Tokens: in=25 out=110 tot=135');
    expect(frame).toContain('45.2 tok/s');
    expect(frame).toContain('Cost: $0.0018');
    expect(frame).toContain('2% budget');
  });

  it('renders codebase scan progressbar when scanProgress is provided', () => {
    const frame = renderTui(baseState({
      width: 100,
      scanProgress: {
        total: 150,
        scanned: 75,
        phase: 'indexing AST',
      },
    }));
    expect(frame).toContain('[Codebase Scan]');
    expect(frame).toContain('50%');
    expect(frame).toContain('75/150 files');
    expect(frame).toContain('indexing AST');
  });
});


