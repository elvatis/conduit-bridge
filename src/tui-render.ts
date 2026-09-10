export type TuiView = 'chat' | 'runs' | 'git' | 'help';
export type TuiOverlay = 'none' | 'palette' | 'models' | 'sessions';

export interface TuiMessage { role: 'user' | 'assistant'; content: string; model?: string; status?: string }
export interface TuiModelRow { id: string; displayName?: string }
export interface TuiSessionRow { id: string; title: string; model?: string; updatedAt: number }
export interface TuiRunRow { id: string; status: string; model?: string; prompt: string }
export interface TuiGit { detected: boolean; branch: string; files: number; name: string }

export interface TuiState {
  view: TuiView;
  overlay: TuiOverlay;
  model: string;
  sessionId: string;
  sessionTitle: string;
  messages: TuiMessage[];
  input: string;
  cursor: number;
  filter: string;
  selected: number;
  models: TuiModelRow[];
  sessions: TuiSessionRow[];
  runs: TuiRunRow[];
  git: TuiGit;
  host: string;
  notice: string;
  busy: boolean;
  streaming: string;
  width: number;
  height: number;
}

export type TuiKey =
  | { type: 'char'; value: string }
  | { type: 'enter' }
  | { type: 'escape' }
  | { type: 'backspace' }
  | { type: 'tab' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'ctrl'; key: string };

export type TuiAction = 'none' | 'send' | 'quit' | 'cancel' | 'new' | 'open-session' | 'refresh';

const CYAN = '\x1b[38;2;34;180;255m';
const COPPER = '\x1b[38;2;255;138;61m';
const TEXT = '\x1b[38;2;244;246;251m';
const MUTED = '\x1b[38;2;160;171;186m';
const GREEN = '\x1b[38;2;63;185;80m';
const RED = '\x1b[38;2;248;81;73m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const REVERSE = '\x1b[7m';

export const TUI_COLORS = { CYAN, COPPER, TEXT, MUTED, GREEN, RED, RESET, BOLD };

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

export function paletteCommands(): Array<{ id: string; label: string; hint: string; action: TuiAction | 'models' | 'sessions' | 'runs' | 'git' | 'help' | 'chat' }> {
  return [
    { id: 'new', label: 'New conversation', hint: 'Ctrl+N', action: 'new' },
    { id: 'model', label: 'Switch model', hint: 'Ctrl+P', action: 'models' },
    { id: 'sessions', label: 'Resume session', hint: 'Ctrl+L', action: 'sessions' },
    { id: 'runs', label: 'Execution runs', hint: 'Ctrl+R', action: 'runs' },
    { id: 'git', label: 'Git workspace', hint: 'Ctrl+G', action: 'git' },
    { id: 'help', label: 'Keyboard help', hint: '?', action: 'help' },
    { id: 'quit', label: 'Quit', hint: 'Ctrl+Q', action: 'quit' },
  ];
}

function visible(value: string): number { return stripAnsi(value).length; }

function pad(value: string, width: number): string {
  const extra = width - visible(value);
  return extra > 0 ? value + ' '.repeat(extra) : value;
}

function clip(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) return pad(value, width);
  return plain.slice(0, Math.max(0, width - 1)) + '…';
}

function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let rest = paragraph;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(' ', width);
      if (cut < 1) cut = width;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
  }
  return lines.length ? lines : [''];
}

export function decodeKey(seq: string): TuiKey | undefined {
  if (!seq) return undefined;
  if (seq === '\r' || seq === '\n') return { type: 'enter' };
  if (seq === '\x1b') return { type: 'escape' };
  if (seq === '\x7f' || seq === '\b') return { type: 'backspace' };
  if (seq === '\t') return { type: 'tab' };
  if (seq === '\x1b[A') return { type: 'up' };
  if (seq === '\x1b[B') return { type: 'down' };
  if (seq === '\x1b[C') return { type: 'right' };
  if (seq === '\x1b[D') return { type: 'left' };
  if (seq.length === 1 && seq.charCodeAt(0) < 32) {
    const key = String.fromCharCode(seq.charCodeAt(0) + 96);
    if (key >= 'a' && key <= 'z') return { type: 'ctrl', key };
  }
  if (seq.length === 1 && seq >= ' ') return { type: 'char', value: seq };
  return undefined;
}

function filteredModels(state: TuiState): TuiModelRow[] {
  const query = (state.overlay === 'models' ? state.filter : '').toLowerCase();
  return state.models.filter(item => !query || item.id.toLowerCase().includes(query) || (item.displayName || '').toLowerCase().includes(query));
}

function filteredSessions(state: TuiState): TuiSessionRow[] {
  const query = (state.overlay === 'sessions' ? state.filter : '').toLowerCase();
  return state.sessions.filter(item => !query || item.title.toLowerCase().includes(query) || item.id.toLowerCase().includes(query) || (item.model || '').toLowerCase().includes(query));
}

function filteredPalette(state: TuiState) {
  const query = state.filter.toLowerCase();
  return paletteCommands().filter(item => !query || item.label.toLowerCase().includes(query) || item.id.includes(query));
}

function insertChar(state: TuiState, value: string): TuiState {
  if (state.overlay !== 'none') {
    return { ...state, filter: state.filter + value, selected: 0 };
  }
  const input = state.input.slice(0, state.cursor) + value + state.input.slice(state.cursor);
  return { ...state, input, cursor: state.cursor + value.length };
}

function backspace(state: TuiState): TuiState {
  if (state.overlay !== 'none') return { ...state, filter: state.filter.slice(0, -1), selected: 0 };
  if (state.cursor < 1) return state;
  const input = state.input.slice(0, state.cursor - 1) + state.input.slice(state.cursor);
  return { ...state, input, cursor: state.cursor - 1 };
}

export function applyTuiKey(state: TuiState, key: TuiKey): { state: TuiState; action: TuiAction; payload?: string } {
  if (key.type === 'ctrl' && key.key === 'q') return { state, action: 'quit' };
  if (key.type === 'ctrl' && key.key === 'c') return { state: { ...state, input: '', cursor: 0 }, action: state.busy ? 'cancel' : 'none' };
  if (key.type === 'escape') {
    if (state.overlay !== 'none') return { state: { ...state, overlay: 'none', filter: '', selected: 0 }, action: 'none' };
    if (state.view !== 'chat') return { state: { ...state, view: 'chat' }, action: 'none' };
    return { state, action: state.busy ? 'cancel' : 'none' };
  }
  if (key.type === 'ctrl' && key.key === 'k') return { state: { ...state, overlay: 'palette', filter: '', selected: 0 }, action: 'none' };
  if (key.type === 'ctrl' && key.key === 'n') return { state: { ...state, overlay: 'none', view: 'chat' }, action: 'new' };
  if (key.type === 'ctrl' && key.key === 'p') return { state: { ...state, overlay: 'models', filter: '', selected: Math.max(0, filteredModels({ ...state, overlay: 'models', filter: '' }).findIndex(item => item.id === state.model)) }, action: 'none' };
  if (key.type === 'ctrl' && key.key === 'l') return { state: { ...state, overlay: 'sessions', filter: '', selected: 0 }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'r') return { state: { ...state, overlay: 'none', view: 'runs' }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'g') return { state: { ...state, overlay: 'none', view: 'git' }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'u') return { state: state.overlay === 'none' ? { ...state, input: '', cursor: 0 } : { ...state, filter: '' }, action: 'none' };

  if (state.overlay !== 'none') {
    const items = state.overlay === 'palette' ? filteredPalette(state) : state.overlay === 'models' ? filteredModels(state) : filteredSessions(state);
    if (key.type === 'up') return { state: { ...state, selected: Math.max(0, state.selected - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, selected: Math.min(Math.max(0, items.length - 1), state.selected + 1) }, action: 'none' };
    if (key.type === 'char') return { state: insertChar(state, key.value), action: 'none' };
    if (key.type === 'backspace') return { state: backspace(state), action: 'none' };
    if (key.type === 'enter') {
      const item = items[state.selected];
      if (!item) return { state, action: 'none' };
      if (state.overlay === 'models') return { state: { ...state, model: (item as TuiModelRow).id, overlay: 'none', filter: '', notice: `Next reply uses ${(item as TuiModelRow).id}` }, action: 'none' };
      if (state.overlay === 'sessions') return { state: { ...state, overlay: 'none', filter: '', sessionId: (item as TuiSessionRow).id }, action: 'open-session' };
      const command = item as ReturnType<typeof paletteCommands>[number];
      if (command.action === 'models') return { state: { ...state, overlay: 'models', filter: '', selected: 0 }, action: 'none' };
      if (command.action === 'sessions') return { state: { ...state, overlay: 'sessions', filter: '', selected: 0 }, action: 'refresh' };
      if (command.action === 'runs' || command.action === 'git' || command.action === 'help' || command.action === 'chat') {
        return { state: { ...state, overlay: 'none', view: command.action === 'chat' ? 'chat' : command.action, filter: '' }, action: command.action === 'runs' || command.action === 'git' ? 'refresh' : 'none' };
      }
      if (command.action === 'new' || command.action === 'quit') return { state: { ...state, overlay: 'none', filter: '' }, action: command.action };
    }
    return { state, action: 'none' };
  }

  if (key.type === 'tab') {
    const order: TuiView[] = ['chat', 'runs', 'git', 'help'];
    const next = order[(order.indexOf(state.view) + 1) % order.length];
    return { state: { ...state, view: next }, action: next === 'runs' || next === 'git' ? 'refresh' : 'none' };
  }
  if (key.type === 'char' && key.value === '?' && !state.input) return { state: { ...state, view: 'help' }, action: 'none' };
  if (key.type === 'char') return { state: insertChar(state, key.value), action: 'none' };
  if (key.type === 'backspace') return { state: backspace(state), action: 'none' };
  if (key.type === 'left') return { state: { ...state, cursor: Math.max(0, state.cursor - 1) }, action: 'none' };
  if (key.type === 'right') return { state: { ...state, cursor: Math.min(state.input.length, state.cursor + 1) }, action: 'none' };
  if (key.type === 'enter') {
    if (!state.input.trim()) return { state, action: 'none' };
    const payload = state.input;
    return { state: { ...state, input: '', cursor: 0 }, action: 'send', payload };
  }
  return { state, action: 'none' };
}

function navMark(current: TuiView, id: TuiView, label: string): string {
  return current === id ? `${BOLD}${CYAN}${label}${RESET}` : `${MUTED}${label}${RESET}`;
}

function paintList(title: string, rows: string[], selected: number, width: number, height: number): string[] {
  const lines = [`${BOLD}${TEXT}${title}${RESET}`, `${MUTED}${'─'.repeat(Math.max(8, width - 2))}${RESET}`];
  const body = Math.max(3, height - 8);
  const start = Math.max(0, selected - body + 1);
  const visibleRows = rows.slice(start, start + body);
  if (!visibleRows.length) lines.push(`${MUTED}  nothing matches${RESET}`);
  visibleRows.forEach((row, index) => {
    const active = start + index === selected;
    lines.push(active ? `${REVERSE}${CYAN} ${clip(row, width - 3)} ${RESET}` : `  ${clip(row, width - 3)}`);
  });
  return lines;
}

export function renderTui(state: TuiState): string {
  const width = Math.max(60, state.width || 80);
  const height = Math.max(16, state.height || 24);
  const git = state.git.detected ? `${state.git.name} ${state.git.branch}${state.git.files ? ` · ${state.git.files} changed` : ''}` : 'no git workspace';
  const header = `${BOLD}${CYAN}CONDUIT${RESET}  ${TEXT}${state.view}${RESET}  ${COPPER}${clip(state.model, 28)}${RESET}  ${MUTED}${clip(state.sessionTitle || state.sessionId, 22)}${RESET}  ${DIM}${state.host}${RESET}`;
  const nav = [
    navMark(state.view, 'chat', 'Chat'),
    navMark(state.view, 'runs', 'Runs'),
    navMark(state.view, 'git', 'Git'),
    navMark(state.view, 'help', 'Help'),
    `${MUTED}Ctrl+K palette${RESET}`,
  ].join('   ');
  const status = `${state.busy ? `${COPPER}running${RESET}` : `${GREEN}ready${RESET}`}  ${MUTED}${git}${RESET}  ${state.notice}`;
  const shortcuts = `${MUTED}Ctrl+N new  Ctrl+P model  Ctrl+L sessions  Ctrl+R runs  Ctrl+G git  Ctrl+Q quit${RESET}`;

  let body: string[] = [];
  if (state.overlay === 'palette') {
    body = paintList('Command palette', filteredPalette(state).map(item => `${item.label}   ${item.hint}`), state.selected, width, height);
  } else if (state.overlay === 'models') {
    body = paintList('Models', filteredModels(state).map(item => `${item.id}${item.id === state.model ? '  (current)' : ''}`), state.selected, width, height);
  } else if (state.overlay === 'sessions') {
    body = paintList('Sessions', filteredSessions(state).map(item => `${item.title}  ${item.model || ''}`), state.selected, width, height);
  } else if (state.view === 'runs') {
    body = paintList('Execution', state.runs.map(run => `${run.status.padEnd(10)}  ${run.model || ''}  ${run.prompt}`), 0, width, height);
  } else if (state.view === 'git') {
    body = [
      `${BOLD}${TEXT}Git workspace${RESET}`,
      state.git.detected ? `${GREEN}${state.git.name}${RESET}  ${CYAN}${state.git.branch}${RESET}  ${state.git.files} changed files` : `${MUTED}No repository is registered for this workspace.${RESET}`,
    ];
  } else if (state.view === 'help') {
    body = [
      `${BOLD}${TEXT}Keyboard${RESET}`,
      `${CYAN}Enter${RESET} send    ${CYAN}Esc${RESET} close overlay / cancel    ${CYAN}Tab${RESET} next pane`,
      `${CYAN}Ctrl+K${RESET} command palette`,
      `${CYAN}Ctrl+N${RESET} new chat   ${CYAN}Ctrl+P${RESET} models   ${CYAN}Ctrl+L${RESET} sessions`,
      `${CYAN}Ctrl+R${RESET} runs   ${CYAN}Ctrl+G${RESET} git   ${CYAN}Ctrl+Q${RESET} quit`,
      `${MUTED}Type a message in Chat. Slash commands still work: /model /new /stop /quit${RESET}`,
    ];
  } else {
    const transcript: string[] = [];
    for (const message of state.messages) {
      const who = message.role === 'user' ? `${COPPER}you${RESET}` : `${CYAN}conduit${RESET}`;
      const meta = message.model ? `${MUTED}  ${message.model}${RESET}` : '';
      transcript.push(`${who}${meta}`);
      for (const line of wrap(message.content, width - 4)) transcript.push(`  ${TEXT}${line}${RESET}`);
      transcript.push('');
    }
    if (state.streaming) {
      transcript.push(`${CYAN}conduit${RESET}  ${MUTED}streaming${RESET}`);
      for (const line of wrap(state.streaming, width - 4)) transcript.push(`  ${TEXT}${line}${RESET}`);
    }
    if (!transcript.length) {
      transcript.push(`${BOLD}${TEXT}Start from the keyboard.${RESET}`);
      transcript.push(`${MUTED}Ctrl+K opens the palette. Ctrl+P picks a model. Type to chat.${RESET}`);
    }
    const room = Math.max(4, height - 8);
    body = transcript.slice(-room);
  }

  const caret = state.overlay === 'none' && state.view === 'chat'
    ? `${COPPER}›${RESET} ${state.input.slice(0, state.cursor)}${REVERSE} ${RESET}${state.input.slice(state.cursor)}`
    : state.overlay === 'none' ? `${MUTED}${state.view}  Esc returns to chat${RESET}` : `${MUTED}filter:${RESET} ${state.filter}`;

  const lines = [
    clip(header, width),
    clip(nav, width),
    `${MUTED}${'─'.repeat(width)}${RESET}`,
    ...body.map(line => clip(line, width)),
  ];
  while (lines.length < height - 3) lines.push(' '.repeat(width));
  lines.push(`${MUTED}${'─'.repeat(width)}${RESET}`);
  lines.push(clip(caret, width));
  lines.push(clip(status + '  ' + shortcuts, width));
  return `\x1b[?25l\x1b[H\x1b[J${lines.join('\n')}`;
}
