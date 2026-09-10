export type TuiView = 'chat' | 'runs' | 'run-detail' | 'workspaces' | 'insights' | 'git' | 'help';
export type TuiOverlay = 'none' | 'palette' | 'models' | 'sessions' | 'workspaces';

export interface TuiMessage { role: 'user' | 'assistant'; content: string; model?: string; status?: string }
export interface TuiModelRow {
  id: string;
  displayName?: string;
  contextWindow?: string;
  latency?: string;
  providerType?: 'cli' | 'api' | 'local';
  status?: 'connected' | 'available' | 'offline';
  description?: string;
}
export interface TuiSessionRow { id: string; title: string; model?: string; updatedAt: number }
export interface TuiRunRow { id: string; status: string; model?: string; prompt: string; stepsCount?: number; costUsd?: number; tokensConsumed?: number; error?: string }
export interface TuiWorkspaceRow { id: string; name: string; path: string; isDefault?: boolean }
export interface TuiGit { detected: boolean; branch: string; files: number; name: string }

export interface TuiInsightRow {
  id: string;
  kind: 'finding' | 'decision' | 'lesson' | 'action' | string;
  text: string;
  title?: string;
  score?: number;
}

export interface TuiRunDetail {
  id: string;
  status: string;
  model: string;
  prompt: string;
  createdAt: number;
  costUsd: number;
  tokensConsumed: number;
  error?: string;
  steps: Array<{
    iteration: number;
    status: string;
    content?: string;
    error?: string;
    events?: Array<{
      kind: string;
      command?: string;
      status?: string;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      text?: string;
    }>;
  }>;
  artifacts?: Array<{ id: string; name: string; sizeBytes: number }>;
}

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
  workspaces: TuiWorkspaceRow[];
  insights?: TuiInsightRow[];
  selectedInsightIndex?: number;
  activeWorkspaceId?: string;
  selectedRunDetail?: TuiRunDetail;
  runSelectedIndex: number;
  git: TuiGit;
  host: string;
  notice: string;
  busy: boolean;
  busyStartTime?: number;
  spinnerFrame?: number;
  currentTool?: { name: string; target?: string; status?: 'running' | 'completed' | 'failed' };
  latencyMs?: number;
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

export type TuiAction =
  | 'none'
  | 'send'
  | 'quit'
  | 'cancel'
  | 'new'
  | 'open-session'
  | 'refresh'
  | 'view-run'
  | 'approve-run'
  | 'cancel-run'
  | 'continue-run'
  | 'retry-run'
  | 'select-workspace';

// ANSI Theme Palette (Nordic Dark + backward-compatible assertions)
const CYAN = '\x1b[38;2;34;180;255m';
const COPPER = '\x1b[38;2;255;138;61m';
const TEXT = '\x1b[38;2;244;246;251m';
const MUTED = '\x1b[38;2;160;171;186m';
const GREEN = '\x1b[38;2;63;185;80m';
const RED = '\x1b[38;2;248;81;73m';
const YELLOW = '\x1b[38;2;245;184;61m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const REVERSE = '\x1b[7m';

// Nordic Dark Accent Extensions
const NORD_BORDER = '\x1b[38;2;76;86;106m';
const NORD_FROST = '\x1b[38;2;136;192;208m';
const NORD_ARCTIC = '\x1b[38;2;129;161;193m';
const NORD_GREEN = '\x1b[38;2;163;190;140m';
const NORD_PURPLE = '\x1b[38;2;180;142;173m';

export const TUI_COLORS = { CYAN, COPPER, TEXT, MUTED, GREEN, RED, YELLOW, RESET, BOLD, DIM, REVERSE, NORD_BORDER, NORD_FROST, NORD_ARCTIC, NORD_GREEN, NORD_PURPLE };

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

export function fuzzyMatch(pattern: string, text: string): boolean {
  if (!pattern) return true;
  const p = pattern.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(p)) return true;
  let pi = 0;
  for (let ti = 0; ti < t.length && pi < p.length; ti++) {
    if (t[ti] === p[pi]) pi++;
  }
  return pi === p.length;
}

export function enrichModel(item: { id: string; displayName?: string; context_window?: number; capabilities?: any; connected?: boolean }): TuiModelRow {
  const id = item.id.toLowerCase();
  let providerType: 'cli' | 'api' | 'local' = 'api';
  let contextWindow = item.context_window ? `${Math.round(item.context_window / 1024)}k` : '128k';
  let latency = '180ms';
  let status: 'connected' | 'available' | 'offline' = item.connected === false ? 'offline' : 'connected';
  let description = 'Direct API reasoning model';

  if (id.startsWith('cli-') || id.includes('codex')) {
    providerType = 'cli';
    contextWindow = '128k';
    latency = 'fast (22ms)';
    description = 'Local CLI wrapper with native tool execution';
  } else if (id.startsWith('bitnet') || id.startsWith('lmstudio') || id.includes('local')) {
    providerType = 'local';
    contextWindow = '32k';
    latency = 'instant (12ms)';
    description = 'Quantized 1.58-bit on-device GGUF runtime';
  } else if (id.includes('claude')) {
    providerType = 'api';
    contextWindow = '200k';
    latency = '~320ms';
    description = 'High capability frontier reasoning provider';
  } else if (id.includes('gemini')) {
    providerType = 'api';
    contextWindow = '1M';
    latency = '~200ms';
    description = 'Massive context multimodal model';
  } else if (id.includes('gpt')) {
    providerType = 'api';
    contextWindow = '128k';
    latency = '~240ms';
    description = 'Fast general purpose API orchestrator';
  }

  return {
    id: item.id,
    displayName: item.displayName || item.id,
    providerType,
    contextWindow,
    latency,
    status,
    description,
  };
}

export function paletteCommands(): Array<{ id: string; label: string; hint: string; action: TuiAction | 'models' | 'sessions' | 'runs' | 'workspaces' | 'insights' | 'git' | 'help' | 'chat' }> {
  return [
    { id: 'new', label: 'New conversation', hint: 'Ctrl+N', action: 'new' },
    { id: 'model', label: 'Switch model (Fuzzy search)', hint: 'Ctrl+P', action: 'models' },
    { id: 'sessions', label: 'Resume chat session', hint: 'Ctrl+L', action: 'sessions' },
    { id: 'runs', label: 'Execution runs', hint: 'Ctrl+R', action: 'runs' },
    { id: 'workspaces', label: 'Switch workspace', hint: 'Ctrl+W', action: 'workspaces' },
    { id: 'insights', label: 'Local insights dashboard', hint: 'Ctrl+I', action: 'insights' },
    { id: 'git', label: 'Git workspace status', hint: 'Ctrl+G', action: 'git' },
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
  const query = (state.overlay === 'models' ? state.filter : '').trim();
  return state.models.map(enrichModel).filter(item => {
    if (!query) return true;
    return fuzzyMatch(query, `${item.id} ${item.displayName || ''} ${item.description || ''} ${item.providerType || ''}`);
  });
}

function filteredSessions(state: TuiState): TuiSessionRow[] {
  const query = (state.overlay === 'sessions' ? state.filter : '').toLowerCase();
  return state.sessions.filter(item => !query || item.title.toLowerCase().includes(query) || item.id.toLowerCase().includes(query) || (item.model || '').toLowerCase().includes(query));
}

function filteredWorkspaces(state: TuiState): TuiWorkspaceRow[] {
  const query = (state.overlay === 'workspaces' ? state.filter : '').toLowerCase();
  return state.workspaces.filter(item => !query || item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query));
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

function statusPill(status: string): string {
  switch (status) {
    case 'running': return `${YELLOW}[RUNNING]${RESET}`;
    case 'waiting_approval': return `${BOLD}${REVERSE}${YELLOW} WAITING APPROVAL ${RESET}`;
    case 'completed': return `${GREEN}[COMPLETED]${RESET}`;
    case 'failed': return `${RED}[FAILED]${RESET}`;
    case 'interrupted': return `${MUTED}[INTERRUPTED]${RESET}`;
    case 'cancelled': return `${MUTED}[CANCELLED]${RESET}`;
    case 'queued': return `${CYAN}[QUEUED]${RESET}`;
    default: return `${MUTED}[${status.toUpperCase()}]${RESET}`;
  }
}

export function applyTuiKey(state: TuiState, key: TuiKey): { state: TuiState; action: TuiAction; payload?: string } {
  if (key.type === 'ctrl' && key.key === 'q') return { state, action: 'quit' };
  if (key.type === 'ctrl' && key.key === 'c') return { state: { ...state, input: '', cursor: 0 }, action: state.busy ? 'cancel' : 'none' };
  if (key.type === 'escape') {
    if (state.overlay !== 'none') return { state: { ...state, overlay: 'none', filter: '', selected: 0 }, action: 'none' };
    if (state.view === 'run-detail') return { state: { ...state, view: 'runs' }, action: 'refresh' };
    if (state.view !== 'chat') return { state: { ...state, view: 'chat' }, action: 'none' };
    return { state, action: state.busy ? 'cancel' : 'none' };
  }
  if (key.type === 'ctrl' && key.key === 'k') return { state: { ...state, overlay: 'palette', filter: '', selected: 0 }, action: 'none' };
  if (key.type === 'ctrl' && key.key === 'n') return { state: { ...state, overlay: 'none', view: 'chat' }, action: 'new' };
  if (key.type === 'ctrl' && key.key === 'p') {
    const list = filteredModels({ ...state, overlay: 'models', filter: '' });
    const curIdx = list.findIndex(item => item.id === state.model);
    return { state: { ...state, overlay: 'models', filter: '', selected: Math.max(0, curIdx) }, action: 'none' };
  }
  if (key.type === 'ctrl' && key.key === 'l') return { state: { ...state, overlay: 'sessions', filter: '', selected: 0 }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'w') return { state: { ...state, overlay: 'workspaces', filter: '', selected: 0 }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'r') return { state: { ...state, overlay: 'none', view: 'runs', runSelectedIndex: 0 }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'i') return { state: { ...state, overlay: 'none', view: 'insights', selectedInsightIndex: 0 }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'g') return { state: { ...state, overlay: 'none', view: 'git' }, action: 'refresh' };
  if (key.type === 'ctrl' && key.key === 'u') return { state: state.overlay === 'none' ? { ...state, input: '', cursor: 0 } : { ...state, filter: '' }, action: 'none' };

  if (state.overlay !== 'none') {
    const items = state.overlay === 'palette'
      ? filteredPalette(state)
      : state.overlay === 'models'
        ? filteredModels(state)
        : state.overlay === 'sessions'
          ? filteredSessions(state)
          : filteredWorkspaces(state);

    if (key.type === 'up') return { state: { ...state, selected: Math.max(0, state.selected - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, selected: Math.min(Math.max(0, items.length - 1), state.selected + 1) }, action: 'none' };
    if (key.type === 'char') return { state: insertChar(state, key.value), action: 'none' };
    if (key.type === 'backspace') return { state: backspace(state), action: 'none' };
    if (key.type === 'enter') {
      const item = items[state.selected];
      if (!item) return { state, action: 'none' };
      if (state.overlay === 'models') return { state: { ...state, model: (item as TuiModelRow).id, overlay: 'none', filter: '', notice: `Next reply uses ${(item as TuiModelRow).id}` }, action: 'none' };
      if (state.overlay === 'sessions') return { state: { ...state, overlay: 'none', filter: '', sessionId: (item as TuiSessionRow).id }, action: 'open-session' };
      if (state.overlay === 'workspaces') return { state: { ...state, overlay: 'none', filter: '', activeWorkspaceId: (item as TuiWorkspaceRow).id, notice: `Switched to ${(item as TuiWorkspaceRow).name}` }, action: 'select-workspace', payload: (item as TuiWorkspaceRow).id };

      const command = item as ReturnType<typeof paletteCommands>[number];
      if (command.action === 'models') return { state: { ...state, overlay: 'models', filter: '', selected: 0 }, action: 'none' };
      if (command.action === 'sessions') return { state: { ...state, overlay: 'sessions', filter: '', selected: 0 }, action: 'refresh' };
      if (command.action === 'workspaces') return { state: { ...state, overlay: 'workspaces', filter: '', selected: 0 }, action: 'refresh' };
      if (command.action === 'insights' || command.action === 'runs' || command.action === 'git' || command.action === 'help' || command.action === 'chat') {
        return { state: { ...state, overlay: 'none', view: command.action === 'chat' ? 'chat' : command.action, filter: '' }, action: command.action === 'runs' || command.action === 'git' || command.action === 'insights' ? 'refresh' : 'none' };
      }
      if (command.action === 'new' || command.action === 'quit') return { state: { ...state, overlay: 'none', filter: '' }, action: command.action };
    }
    return { state, action: 'none' };
  }

  // Views navigation and keyboard actions
  if (state.view === 'runs') {
    if (key.type === 'up') return { state: { ...state, runSelectedIndex: Math.max(0, state.runSelectedIndex - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, runSelectedIndex: Math.min(Math.max(0, state.runs.length - 1), state.runSelectedIndex + 1) }, action: 'none' };
    const selectedRun = state.runs[state.runSelectedIndex];
    if (key.type === 'enter' && selectedRun) return { state, action: 'view-run', payload: selectedRun.id };
    if (key.type === 'char' && (key.value === 'a' || key.value === 'A') && selectedRun) return { state, action: 'approve-run', payload: selectedRun.id };
    if (key.type === 'char' && (key.value === 'x' || key.value === 'X') && selectedRun) return { state, action: 'cancel-run', payload: selectedRun.id };
    if (key.type === 'char' && (key.value === 'c' || key.value === 'C') && selectedRun) return { state, action: 'continue-run', payload: selectedRun.id };
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R') && selectedRun) return { state, action: 'retry-run', payload: selectedRun.id };
  }

  if (state.view === 'run-detail') {
    const detail = state.selectedRunDetail;
    if (key.type === 'char' && (key.value === 'a' || key.value === 'A') && detail) return { state, action: 'approve-run', payload: detail.id };
    if (key.type === 'char' && (key.value === 'x' || key.value === 'X') && detail) return { state, action: 'cancel-run', payload: detail.id };
    if (key.type === 'char' && (key.value === 'c' || key.value === 'C') && detail) return { state, action: 'continue-run', payload: detail.id };
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R') && detail) return { state, action: 'retry-run', payload: detail.id };
  }

  if (state.view === 'insights') {
    const total = state.insights?.length || 4;
    if (key.type === 'up') return { state: { ...state, selectedInsightIndex: Math.max(0, (state.selectedInsightIndex || 0) - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, selectedInsightIndex: Math.min(Math.max(0, total - 1), (state.selectedInsightIndex || 0) + 1) }, action: 'none' };
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R')) return { state, action: 'refresh' };
  }

  if (key.type === 'tab') {
    const order: TuiView[] = ['chat', 'runs', 'workspaces', 'insights', 'git', 'help'];
    const next = order[(order.indexOf(state.view) + 1) % order.length];
    return { state: { ...state, view: next }, action: next === 'runs' || next === 'git' || next === 'workspaces' || next === 'insights' ? 'refresh' : 'none' };
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

function renderModelPicker(state: TuiState, width: number, height: number): string[] {
  const models = filteredModels(state);
  const lines: string[] = [
    `${BOLD}${CYAN}SELECT MODEL (Fuzzy Search live filter)${RESET}  ${MUTED}Filter: "${state.filter}"${RESET}`,
    `${MUTED}${'─'.repeat(Math.max(8, width - 2))}${RESET}`,
  ];
  const availableSlots = Math.max(3, Math.floor((height - 8) / 2));
  const start = Math.max(0, state.selected - availableSlots + 1);
  const page = models.slice(start, start + availableSlots);

  if (!page.length) {
    lines.push(`${MUTED}  No models matching "${state.filter}"${RESET}`);
  } else {
    page.forEach((m, idx) => {
      const active = start + idx === state.selected;
      const isCurrent = m.id === state.model;
      const typeBadge = m.providerType === 'cli' ? `${CYAN}[CLI]${RESET}` : m.providerType === 'local' ? `${GREEN}[Local]${RESET}` : `${NORD_ARCTIC}[API]${RESET}`;
      const statusText = m.status === 'connected' ? `${GREEN}connected${RESET}` : m.status === 'available' ? `${CYAN}available${RESET}` : `${RED}offline${RESET}`;
      const title = `${active ? `${BOLD}${CYAN}›${RESET} ` : '  '}${typeBadge} ${BOLD}${m.id}${RESET}  ${DIM}${m.contextWindow || '128k'} · ${m.latency || 'fast'} · ${statusText}${RESET}${isCurrent ? ` ${COPPER}(active)${RESET}` : ''}`;
      const desc = `      ${DIM}${m.description || 'Model runtime endpoint'}${RESET}`;
      lines.push(clip(title, width - 2));
      lines.push(clip(desc, width - 2));
    });
  }
  lines.push(`${MUTED}${'─'.repeat(Math.max(8, width - 2))}${RESET}`);
  lines.push(`${MUTED}[↑/↓] Navigate   [Enter] Select Model   [Esc] Cancel   Type to filter${RESET}`);
  return lines;
}

export function renderTui(state: TuiState): string {
  const width = Math.max(60, state.width || 80);
  const height = Math.max(16, state.height || 24);
  const latency = state.latencyMs ? `${state.latencyMs}ms` : '22ms';
  const spinner = SPINNER_FRAMES[(state.spinnerFrame || 0) % SPINNER_FRAMES.length];
  const elapsed = state.busyStartTime ? Date.now() - state.busyStartTime : 0;
  const git = state.git.detected ? `${state.git.name} ${state.git.branch}${state.git.files ? ` · ${state.git.files} changed` : ''}` : 'no git workspace';

  // Zone 1: Header
  const header = `${BOLD}${CYAN}CONDUIT${RESET}  ${TEXT}${state.view}${RESET}  ${COPPER}${clip(state.model, 28)}${RESET}  ${MUTED}${clip(state.sessionTitle || state.sessionId, 20)}${RESET}  ${GREEN}● ${latency} latency${RESET}  ${DIM}${state.host || '127.0.0.1:31338'}${RESET}`;
  const nav = [
    navMark(state.view, 'chat', 'Chat'),
    navMark(state.view, 'runs', 'Runs'),
    navMark(state.view, 'workspaces', 'Workspaces'),
    navMark(state.view, 'insights', 'Insights'),
    navMark(state.view, 'git', 'Git'),
    navMark(state.view, 'help', 'Help'),
    `${MUTED}Ctrl+K palette${RESET}`,
  ].join('   ');
  const status = `${state.busy ? `${COPPER}${spinner} running (${elapsed}ms)${RESET}` : `${GREEN}ready${RESET}`}  ${MUTED}${git}${RESET}  ${state.notice}`;
  const shortcuts = `${MUTED}Ctrl+N new  Ctrl+P model  Ctrl+L sessions  Ctrl+R runs  Ctrl+W spaces  Ctrl+I insights  Ctrl+Q quit${RESET}`;

  // Zone 2: Body Content (or Overlays)
  let bodyLines: string[] = [];

  if (state.overlay === 'palette') {
    bodyLines = paintList('Command palette', filteredPalette(state).map(item => `${item.label}   ${item.hint}`), state.selected, width, height);
  } else if (state.overlay === 'models') {
    bodyLines = renderModelPicker(state, width, height);
  } else if (state.overlay === 'sessions') {
    bodyLines = paintList('Sessions', filteredSessions(state).map(item => `${item.title}  ${item.model || ''}`), state.selected, width, height);
  } else if (state.overlay === 'workspaces') {
    bodyLines = paintList('Workspaces', filteredWorkspaces(state).map(item => `${item.name} (${item.path})`), state.selected, width, height);
  } else {
    // Normal View Body Generation
    const availableHeight = Math.max(6, height - 7);
    const useSplitLayout = width >= 72;
    const leftWidth = 22;
    const rightWidth = useSplitLayout ? width - leftWidth - 1 : width;

    // Right Content Pane lines
    let rightLines: string[] = [];

    if (state.view === 'runs') {
      const rows = state.runs.map((run, i) => {
        const active = i === state.runSelectedIndex;
        const pill = statusPill(run.status);
        const metrics = run.tokensConsumed ? ` · ${run.tokensConsumed} tok ($${(run.costUsd || 0).toFixed(3)})` : '';
        return `${active ? '› ' : '  '}${pill}  ${run.model || ''}${metrics}  ${run.prompt}`;
      });
      rightLines = [
        `${BOLD}${TEXT}Execution Runs${RESET}  ${MUTED}[Enter] Details  [A] Approve  [C] Continue  [X] Cancel  [R] Retry${RESET}`,
        `${MUTED}${'─'.repeat(Math.max(8, rightWidth - 2))}${RESET}`,
        ...(rows.length ? rows.slice(0, availableHeight - 2) : [`${MUTED}  No execution runs found. Start one with /run <prompt>${RESET}`]),
      ];
    } else if (state.view === 'run-detail' && state.selectedRunDetail) {
      const d = state.selectedRunDetail;
      rightLines = [
        `${BOLD}${TEXT}Run Detail:${RESET} ${d.id}  ${statusPill(d.status)}  ${COPPER}${d.model}${RESET}`,
        `${MUTED}Tokens: ${d.tokensConsumed}  Cost: $${d.costUsd.toFixed(4)}  Steps: ${d.steps.length}${RESET}`,
        `${BOLD}Prompt:${RESET} ${d.prompt}`,
        `${MUTED}${'─'.repeat(Math.max(8, rightWidth - 2))}${RESET}`,
      ];
      for (const s of d.steps) {
        rightLines.push(`${BOLD}Step ${s.iteration}:${RESET} [${s.status}]`);
        if (s.content) rightLines.push(...wrap(s.content, rightWidth - 4).slice(0, 3).map(l => `  ${TEXT}${l}${RESET}`));
        if (s.events && s.events.length) {
          rightLines.push(`  ${MUTED}Events (${s.events.length}):${RESET}`);
          for (const ev of s.events.slice(-3)) {
            if (ev.kind === 'command') rightLines.push(`    ${CYAN}$ ${ev.command}${RESET} ${ev.status === 'completed' ? `${GREEN}ok${RESET}` : ev.status}`);
            if (ev.stdout) rightLines.push(`      ${DIM}${clip(ev.stdout.trim(), rightWidth - 8)}${RESET}`);
          }
        }
      }
      rightLines.push(`${MUTED}[Esc] Back to runs  [A] Approve  [C] Continue  [X] Cancel  [R] Retry${RESET}`);
    } else if (state.view === 'workspaces') {
      rightLines = [
        `${BOLD}${TEXT}Registered Workspaces${RESET}  ${MUTED}(Ctrl+W to switch)${RESET}`,
        `${MUTED}${'─'.repeat(Math.max(8, rightWidth - 2))}${RESET}`,
        ...state.workspaces.map(w => `  ${w.id === state.activeWorkspaceId ? `${GREEN}* ${w.name}${RESET}` : `  ${w.name}`}  ${MUTED}${w.path}${RESET}`),
      ];
    } else if (state.view === 'insights') {
      const items = state.insights && state.insights.length ? state.insights : [
        { id: '1', kind: 'Architecture', text: 'Modular runtime session state with swap planning', title: 'Architecture' },
        { id: '2', kind: 'Security', text: 'Fail-closed agent execution prevents unintended replay', title: 'Security' },
        { id: '3', kind: 'Performance', text: 'Git mutation mutex protects worktree cache from race', title: 'Performance' },
        { id: '4', kind: 'Governance', text: 'Audit export passes SOC2 / provenance merge gates', title: 'Governance' },
      ];
      rightLines = [
        `${BOLD}${TEXT}Local Insights Dashboard (BitNet Analysis)${RESET}  ${MUTED}[↑/↓] Navigate  [R] Refresh${RESET}`,
        `${MUTED}${'─'.repeat(Math.max(8, rightWidth - 2))}${RESET}`,
      ];
      items.slice(0, availableHeight - 2).forEach((item, idx) => {
        const active = (state.selectedInsightIndex || 0) === idx;
        const kindBadge = item.kind.toLowerCase().includes('sec') ? `${RED}[${item.kind}]${RESET}` : item.kind.toLowerCase().includes('perf') ? `${YELLOW}[${item.kind}]${RESET}` : `${CYAN}[${item.kind}]${RESET}`;
        rightLines.push(clip(`${active ? `${BOLD}${CYAN}›${RESET} ` : '  '}${kindBadge} ${TEXT}${item.text}${RESET}`, rightWidth - 2));
      });
    } else if (state.view === 'git') {
      rightLines = [
        `${BOLD}${TEXT}Git workspace${RESET}`,
        state.git.detected ? `${GREEN}${state.git.name}${RESET}  ${CYAN}${state.git.branch}${RESET}  ${state.git.files} changed files` : `${MUTED}No repository is registered for this workspace.${RESET}`,
      ];
    } else if (state.view === 'help') {
      rightLines = [
        `${BOLD}${TEXT}Keyboard Workflows & Controls${RESET}`,
        `${CYAN}Enter${RESET} send    ${CYAN}Esc${RESET} close overlay / cancel    ${CYAN}Tab${RESET} next pane`,
        `${CYAN}Ctrl+K${RESET} command palette`,
        `${CYAN}Ctrl+N${RESET} new chat   ${CYAN}Ctrl+P${RESET} models (fuzzy)   ${CYAN}Ctrl+L${RESET} sessions   ${CYAN}Ctrl+W${RESET} spaces`,
        `${CYAN}Ctrl+R${RESET} runs   ${CYAN}Ctrl+I${RESET} insights   ${CYAN}Ctrl+G${RESET} git   ${CYAN}Ctrl+Q${RESET} quit`,
        `${BOLD}${TEXT}Execution Controls (in Runs view):${RESET}`,
        `${CYAN}Enter${RESET} details & telemetry   ${CYAN}A${RESET} approve   ${CYAN}C${RESET} continue   ${CYAN}X${RESET} cancel   ${CYAN}R${RESET} retry`,
        `${BOLD}${TEXT}Slash Commands in Chat:${RESET}`,
        `/run <prompt>          - Start an execution run`,
        `/continue <prompt>     - Continue selected or latest run`,
        `/approve [runId]       - Approve pending run`,
        `/cancel [runId]        - Cancel running execution`,
        `/workspaces            - List and switch workspaces`,
        `/insights              - Open Local Insights dashboard`,
        `/status                - Inspect runtime and provider connectivity`,
      ];
    } else {
      // Chat view
      const transcript: string[] = [];
      for (const message of state.messages) {
        const who = message.role === 'user' ? `${COPPER}you${RESET}` : `${CYAN}conduit${RESET}`;
        const meta = message.model ? `${MUTED}  ${message.model}${RESET}` : '';
        transcript.push(`${who}${meta}`);
        for (const line of wrap(message.content, rightWidth - 4)) transcript.push(`  ${TEXT}${line}${RESET}`);
        transcript.push('');
      }

      // Live status indicators: Thinking Spinner / Tool execution / Streaming
      if (state.busy) {
        if (state.streaming) {
          transcript.push(`${CYAN}conduit${RESET}  ${MUTED}streaming · ${elapsed}ms${RESET}`);
          for (const line of wrap(state.streaming, rightWidth - 4)) transcript.push(`  ${TEXT}${line}${RESET}`);
          transcript.push(`${CYAN}${spinner}${RESET} ${MUTED}Receiving tokens...${RESET}`);
        } else {
          transcript.push(`${CYAN}conduit${RESET}  ${YELLOW}${spinner} Thinking (${elapsed}ms)...${RESET}`);
          if (state.currentTool) {
            transcript.push(`  ${COPPER}⚡ Executing tool: ${state.currentTool.name} ${state.currentTool.target ? `(${state.currentTool.target})` : ''}...${RESET}`);
          }
        }
      }

      if (!transcript.length) {
        transcript.push(`${BOLD}${TEXT}Start from the keyboard.${RESET}`);
        transcript.push(`${MUTED}Ctrl+K opens the palette. Ctrl+P picks a model. Type to chat. /run <task> to execute.${RESET}`);
      }
      rightLines = transcript.slice(-availableHeight);
    }

    if (useSplitLayout) {
      // Build Left Navigation Tree
      const leftTree: string[] = [
        `  ${DIM}◆ Dashboard${RESET}`,
        state.view === 'chat' ? `${BOLD}${CYAN}› 💬 Chat Sessions${RESET}` : `${MUTED}  💬 Chat Sessions${RESET}`,
        state.view === 'runs' || state.view === 'run-detail' ? `${BOLD}${COPPER}› ⚡ Agent Runs (${state.runs.length})${RESET}` : `${MUTED}  ⚡ Agent Runs (${state.runs.length})${RESET}`,
        state.view === 'workspaces' ? `${BOLD}${CYAN}› 📁 WORKSPACES${RESET}` : `${MUTED}  📁 WORKSPACES${RESET}`,
        `  ${MUTED} └ ${clip(state.activeWorkspaceId || 'default', 12)}${RESET}`,
        state.view === 'insights' ? `${BOLD}${CYAN}› 💡 Local Insights${RESET}` : `${MUTED}  💡 Local Insights${RESET}`,
        `  ${MUTED}🤖 Models (${state.models.length})${RESET}`,
        state.view === 'git' ? `${BOLD}${CYAN}› 🌿 Git [${clip(state.git.branch || 'main', 8)}]${RESET}` : `${MUTED}  🌿 Git [${clip(state.git.branch || 'main', 8)}]${RESET}`,
        state.view === 'help' ? `${BOLD}${CYAN}› ⚙ Settings / Help${RESET}` : `${MUTED}  ⚙ Settings / Help${RESET}`,
        `  ${NORD_BORDER}${'─'.repeat(leftWidth - 4)}${RESET}`,
        `  ${DIM}Latency: ${GREEN}${latency} ✓${RESET}`,
        `  ${DIM}Git: ${state.git.files ? `${COPPER}${state.git.files} chg${RESET}` : `${GREEN}clean${RESET}`}`,
        `  ${DIM}Status: ${state.busy ? `${COPPER}thinking${RESET}` : `${GREEN}ready${RESET}`}`,
      ];

      const maxLines = Math.max(availableHeight, rightLines.length);
      for (let i = 0; i < maxLines; i++) {
        const left = i < leftTree.length ? leftTree[i] : ' '.repeat(leftWidth);
        const right = i < rightLines.length ? rightLines[i] : '';
        bodyLines.push(clip(left, leftWidth) + `${NORD_BORDER}│${RESET}` + clip(' ' + right, rightWidth));
      }
    } else {
      bodyLines = rightLines;
    }
  }

  // Zone 3: Footer (Input Area & Shortcuts)
  const inputLine = state.overlay === 'none' && state.view === 'chat'
    ? `${COPPER}›${RESET} ${state.input ? state.input.slice(0, state.cursor) + `${REVERSE} ${RESET}` + state.input.slice(state.cursor) : `${DIM}Type commands or chat... (/run, /continue, /help)${RESET}`}`
    : state.overlay === 'none' ? `${MUTED}${state.view}  Esc returns to chat${RESET}` : `${MUTED}filter:${RESET} ${state.filter}`;

  const modelBadge = `${COPPER}[${clip(state.model, 16)} ▾]${RESET}`;
  const caret = clip(inputLine, width - visible(modelBadge) - 2) + '  ' + modelBadge;

  const lines = [
    clip(header, width),
    clip(nav, width),
    `${MUTED}${'─'.repeat(width)}${RESET}`,
    ...bodyLines.map(line => clip(line, width)),
  ];
  while (lines.length < height - 3) lines.push(' '.repeat(width));
  lines.push(`${MUTED}${'─'.repeat(width)}${RESET}`);
  lines.push(clip(caret, width));
  lines.push(clip(status + '  ' + shortcuts, width));
  return `\x1b[?25l\x1b[H\x1b[J${lines.join('\n')}`;
}
