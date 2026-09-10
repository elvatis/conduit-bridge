export type TuiView = 'chat' | 'runs' | 'run-detail' | 'workspaces' | 'insights' | 'git' | 'help';
export type TuiOverlay = 'none' | 'palette' | 'models' | 'sessions' | 'workspaces';
export type TuiInferenceStatus = 'idle' | 'thinking' | 'streaming' | 'tool_execution' | 'diff_apply' | 'done' | 'error';

export interface TuiMessage { role: 'user' | 'assistant'; content: string; model?: string; status?: string }
export interface TuiModelRow {
  id: string;
  displayName?: string;
  contextWindow?: string;
  latency?: string;
  providerType?: 'cli' | 'api' | 'local';
  status?: 'connected' | 'available' | 'offline';
  description?: string;
  toolSupport?: boolean | string;
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
  status?: TuiInferenceStatus;
  tokenCount?: number;
  tokensPerSec?: number;
  inferenceStartTime?: number;
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

export interface TuiTerminalWriter {
  columns: number;
  rows: number;
  write(frame: string): void;
}

/**
 * Double-Buffering & Differential Delta-Line Renderer
 * Completely eliminates cursor flicker and screen tearing by diffing
 * the virtual screen buffer and updating only modified lines in place.
 */
export class TuiDifferentialRenderer {
  private prevLines: string[] = [];
  private prevWidth = 0;
  private prevHeight = 0;

  render(terminal: TuiTerminalWriter, lines: string[], cursor?: { row: number; col: number }): void {
    const width = terminal.columns;
    const height = terminal.rows;
    let out = '';

    if (this.prevWidth !== width || this.prevHeight !== height || this.prevLines.length !== height) {
      out += '\x1b[?25l\x1b[H\x1b[2J';
      for (let r = 0; r < height; r++) {
        const line = lines[r] ?? '';
        out += `\x1b[${r + 1};1H${line}`;
      }
    } else {
      out += '\x1b[?25l';
      for (let r = 0; r < height; r++) {
        const newLine = lines[r] ?? '';
        const oldLine = this.prevLines[r] ?? '';
        if (newLine !== oldLine) {
          out += `\x1b[${r + 1};1H\x1b[2K${newLine}`;
        }
      }
    }

    if (cursor) {
      out += `\x1b[${cursor.row};${cursor.col}H\x1b[?25h`;
    } else {
      out += '\x1b[?25l';
    }

    this.prevLines = [...lines];
    this.prevWidth = width;
    this.prevHeight = height;

    if (out) {
      terminal.write(out);
    }
  }

  reset(): void {
    this.prevLines = [];
    this.prevWidth = 0;
    this.prevHeight = 0;
  }
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
  let toolSupport: boolean | string = true;

  if (id.startsWith('cli-') || id.includes('codex')) {
    providerType = 'cli';
    contextWindow = '128k';
    latency = 'fast (22ms)';
    description = 'Local CLI wrapper with native tool execution';
    toolSupport = 'full';
  } else if (id.startsWith('bitnet') || id.startsWith('lmstudio') || id.includes('local')) {
    providerType = 'local';
    contextWindow = '32k';
    latency = 'instant (12ms)';
    description = 'Quantized 1.58-bit on-device GGUF runtime';
    toolSupport = 'basic';
  } else if (id.includes('claude')) {
    providerType = 'api';
    contextWindow = '200k';
    latency = '~320ms';
    description = 'High capability frontier reasoning provider';
    toolSupport = 'full';
  } else if (id.includes('gemini')) {
    providerType = 'api';
    contextWindow = '1M';
    latency = '~200ms';
    description = 'Massive context multimodal model';
    toolSupport = 'full';
  } else if (id.includes('gpt')) {
    providerType = 'api';
    contextWindow = '128k';
    latency = '~240ms';
    description = 'Fast general purpose API orchestrator';
    toolSupport = 'full';
  }

  return {
    id: item.id,
    displayName: item.displayName || item.id,
    providerType,
    contextWindow,
    latency,
    status,
    description,
    toolSupport,
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
  if (seq === '\x1b[D') return { type: 'left' };
  if (seq === '\x1b[C') return { type: 'right' };
  if (seq === '\x0b') return { type: 'ctrl', key: 'k' };
  if (seq === '\x0e') return { type: 'ctrl', key: 'n' };
  if (seq === '\x10') return { type: 'ctrl', key: 'p' };
  if (seq === '\x0c') return { type: 'ctrl', key: 'l' };
  if (seq === '\x17') return { type: 'ctrl', key: 'w' };
  if (seq === '\x12') return { type: 'ctrl', key: 'r' };
  if (seq === '\x09') return { type: 'tab' };
  if (seq === '\x07') return { type: 'ctrl', key: 'g' };
  if (seq === '\x08') return { type: 'ctrl', key: 'h' };
  if (seq === '\x05') return { type: 'ctrl', key: 'e' };
  if (seq === '\x04') return { type: 'ctrl', key: 'd' };
  if (seq === '\x11') return { type: 'ctrl', key: 'q' };
  if (seq === '\x03') return { type: 'ctrl', key: 'c' };
  if (seq.length === 1 && seq >= ' ' && seq <= '~') return { type: 'char', value: seq };
  return undefined;
}

function insertChar(state: TuiState, char: string): TuiState {
  if (state.overlay !== 'none') {
    const nextFilter = state.filter + char;
    return { ...state, filter: nextFilter, selected: 0 };
  }
  const before = state.input.slice(0, state.cursor);
  const after = state.input.slice(state.cursor);
  return { ...state, input: before + char + after, cursor: state.cursor + char.length };
}

function backspace(state: TuiState): TuiState {
  if (state.overlay !== 'none') {
    return { ...state, filter: state.filter.slice(0, -1), selected: 0 };
  }
  if (state.cursor <= 0) return state;
  const before = state.input.slice(0, state.cursor - 1);
  const after = state.input.slice(state.cursor);
  return { ...state, input: before + after, cursor: state.cursor - 1 };
}

function filteredModels(state: TuiState): TuiModelRow[] {
  return state.models
    .map(m => enrichModel(m))
    .filter(m => fuzzyMatch(state.filter, m.id) || fuzzyMatch(state.filter, m.displayName || '') || fuzzyMatch(state.filter, m.providerType || ''));
}

function filteredSessions(state: TuiState): TuiSessionRow[] {
  return state.sessions.filter(s => fuzzyMatch(state.filter, s.title) || fuzzyMatch(state.filter, s.id) || fuzzyMatch(state.filter, s.model || ''));
}

function filteredPalette(state: TuiState): Array<{ id: string; label: string; hint: string; action: any }> {
  return paletteCommands().filter(c => fuzzyMatch(state.filter, c.label) || fuzzyMatch(state.filter, c.id) || fuzzyMatch(state.filter, c.hint));
}

function filteredWorkspaces(state: TuiState): TuiWorkspaceRow[] {
  return state.workspaces.filter(w => fuzzyMatch(state.filter, w.name) || fuzzyMatch(state.filter, w.id) || fuzzyMatch(state.filter, w.path));
}

export function applyTuiKey(state: TuiState, key: TuiKey): { state: TuiState; action: TuiAction; payload?: string } {
  if (key.type === 'ctrl') {
    if (key.key === 'q' || key.key === 'c') return { state, action: 'quit' };
    if (key.key === 'k') return { state: { ...state, overlay: state.overlay === 'palette' ? 'none' : 'palette', filter: '', selected: 0 }, action: 'none' };
    if (key.key === 'p') return { state: { ...state, overlay: state.overlay === 'models' ? 'none' : 'models', filter: '', selected: 0 }, action: 'none' };
    if (key.key === 'l') return { state: { ...state, overlay: state.overlay === 'sessions' ? 'none' : 'sessions', filter: '', selected: 0 }, action: 'none' };
    if (key.key === 'w') return { state: { ...state, overlay: state.overlay === 'workspaces' ? 'none' : 'workspaces', filter: '', selected: 0 }, action: 'none' };
    if (key.key === 'r') return { state: { ...state, view: 'runs', overlay: 'none' }, action: 'refresh' };
    if (key.key === 'i') return { state: { ...state, view: 'insights', overlay: 'none' }, action: 'refresh' };
    if (key.key === 'n') return { state: { ...state, overlay: 'none', view: 'chat' }, action: 'new' };
    if (key.key === 'g') return { state: { ...state, view: 'git', overlay: 'none' }, action: 'refresh' };
    return { state, action: 'none' };
  }

  if (state.overlay !== 'none') {
    if (key.type === 'escape') return { state: { ...state, overlay: 'none', filter: '', selected: 0 }, action: 'none' };
    const maxItems = state.overlay === 'models' ? filteredModels(state).length
      : state.overlay === 'sessions' ? filteredSessions(state).length
      : state.overlay === 'workspaces' ? filteredWorkspaces(state).length
      : filteredPalette(state).length;

    if (key.type === 'up') return { state: { ...state, selected: Math.max(0, state.selected - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, selected: Math.min(Math.max(0, maxItems - 1), state.selected + 1) }, action: 'none' };
    if (key.type === 'char') return { state: insertChar(state, key.value), action: 'none' };
    if (key.type === 'backspace') return { state: backspace(state), action: 'none' };

    if (key.type === 'enter') {
      if (state.overlay === 'palette') {
        const item = filteredPalette(state)[state.selected];
        if (!item) return { state: { ...state, overlay: 'none' }, action: 'none' };
        if (item.action === 'quit') return { state: { ...state, overlay: 'none' }, action: 'quit' };
        if (item.action === 'new') return { state: { ...state, overlay: 'none', view: 'chat' }, action: 'new' };
        if (item.action === 'models') return { state: { ...state, overlay: 'models', filter: '', selected: 0 }, action: 'none' };
        if (item.action === 'sessions') return { state: { ...state, overlay: 'sessions', filter: '', selected: 0 }, action: 'none' };
        if (item.action === 'runs') return { state: { ...state, overlay: 'none', view: 'runs' }, action: 'refresh' };
        if (item.action === 'workspaces') return { state: { ...state, overlay: 'workspaces', filter: '', selected: 0 }, action: 'none' };
        if (item.action === 'insights') return { state: { ...state, overlay: 'none', view: 'insights' }, action: 'refresh' };
        if (item.action === 'git') return { state: { ...state, overlay: 'none', view: 'git' }, action: 'refresh' };
        if (item.action === 'help') return { state: { ...state, overlay: 'none', view: 'help' }, action: 'none' };
      }
      if (state.overlay === 'models') {
        const item = filteredModels(state)[state.selected];
        return item
          ? { state: { ...state, overlay: 'none', model: item.id, notice: `Active model: ${item.id}` }, action: 'none' }
          : { state: { ...state, overlay: 'none' }, action: 'none' };
      }
      if (state.overlay === 'sessions') {
        const item = filteredSessions(state)[state.selected];
        return item
          ? { state: { ...state, overlay: 'none', sessionId: item.id, sessionTitle: item.title, view: 'chat' }, action: 'open-session' }
          : { state: { ...state, overlay: 'none' }, action: 'none' };
      }
      if (state.overlay === 'workspaces') {
        const item = filteredWorkspaces(state)[state.selected];
        return item
          ? { state: { ...state, overlay: 'none', activeWorkspaceId: item.id, notice: `Switched to workspace ${item.name}` }, action: 'select-workspace', payload: item.id }
          : { state: { ...state, overlay: 'none' }, action: 'none' };
      }
    }
    return { state, action: 'none' };
  }

  if (state.view === 'runs') {
    if (key.type === 'escape') return { state: { ...state, view: 'chat' }, action: 'none' };
    if (key.type === 'up') return { state: { ...state, runSelectedIndex: Math.max(0, state.runSelectedIndex - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, runSelectedIndex: Math.min(Math.max(0, state.runs.length - 1), state.runSelectedIndex + 1) }, action: 'none' };
    const currentRun = state.runs[state.runSelectedIndex];
    if (key.type === 'enter' && currentRun) return { state, action: 'view-run', payload: currentRun.id };
    if (key.type === 'char' && (key.value === 'a' || key.value === 'A') && currentRun) return { state, action: 'approve-run', payload: currentRun.id };
    if (key.type === 'char' && (key.value === 'x' || key.value === 'X') && currentRun) return { state, action: 'cancel-run', payload: currentRun.id };
    if (key.type === 'char' && (key.value === 'c' || key.value === 'C') && currentRun) return { state, action: 'continue-run', payload: currentRun.id };
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R') && currentRun) return { state, action: 'retry-run', payload: currentRun.id };
  }

  if (state.view === 'run-detail') {
    if (key.type === 'escape') return { state: { ...state, view: 'runs' }, action: 'none' };
    const detail = state.selectedRunDetail;
    if (key.type === 'char' && (key.value === 'a' || key.value === 'A') && detail) return { state, action: 'approve-run', payload: detail.id };
    if (key.type === 'char' && (key.value === 'x' || key.value === 'X') && detail) return { state, action: 'cancel-run', payload: detail.id };
    if (key.type === 'char' && (key.value === 'c' || key.value === 'C') && detail) return { state, action: 'continue-run', payload: detail.id };
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R') && detail) return { state, action: 'retry-run', payload: detail.id };
  }

  if (state.view === 'insights') {
    const total = state.insights?.length || 4;
    if (key.type === 'escape') return { state: { ...state, view: 'chat' }, action: 'none' };
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
  lines.push(`${DIM}[↑/↓] Navigate  [Enter] Select  [Esc] Cancel  [Tab] Next group${RESET}`);
  return lines;
}

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'succeeded') return `${GREEN}● ${status}${RESET}`;
  if (s === 'running' || s === 'in_progress') return `${YELLOW}◐ ${status}${RESET}`;
  if (s === 'waiting_approval') return `${COPPER}⏸ ${status}${RESET}`;
  if (s === 'failed' || s === 'error') return `${RED}✖ ${status}${RESET}`;
  return `${MUTED}○ ${status}${RESET}`;
}

export function renderTuiLines(state: TuiState): { lines: string[]; cursor?: { row: number; col: number } } {
  const width = Math.max(40, state.width || 80);
  const height = Math.max(16, state.height || 24);

  const activeWs = state.workspaces.find(w => w.id === state.activeWorkspaceId) || state.workspaces[0];
  const wsLabel = activeWs ? activeWs.name : 'default';
  const gitLabel = state.git.detected ? `${state.git.branch}${state.git.files ? `* (${state.git.files})` : ''}` : 'clean';
  const latency = state.latencyMs ? `${state.latencyMs}ms` : '22ms';

  const spinner = SPINNER_FRAMES[(state.spinnerFrame || 0) % SPINNER_FRAMES.length];
  const elapsed = state.busyStartTime ? Date.now() - state.busyStartTime : 0;
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const tps = state.tokensPerSec !== undefined ? `${state.tokensPerSec} t/s` : '';
  const telemetry = [state.model, `${elapsedSec}s`, tps].filter(Boolean).join(' | ');

  // Zone 1: Header
  const headerLeft = `${BOLD}${CYAN}CONDUIT${RESET} ${DIM}•${RESET} ${COPPER}${clip(wsLabel, 14)}${RESET} ${DIM}•${RESET} ${TEXT}${clip(state.model, 20)}${RESET}`;
  const headerRight = `${DIM}Git:${RESET}${GREEN}${clip(gitLabel, 12)}${RESET} ${DIM}Lat:${RESET}${GREEN}${latency}${RESET}`;
  const header = pad(headerLeft, width - visible(headerRight)) + headerRight;

  // Breadcrumbs / Nav Row
  const navLeft = [
    navMark(state.view, 'chat', '1 Chat'),
    navMark(state.view, 'runs', `2 Runs (${state.runs.length})`),
    navMark(state.view, 'workspaces', '3 Workspaces'),
    navMark(state.view, 'insights', '4 Insights'),
    navMark(state.view, 'git', '5 Git'),
    navMark(state.view, 'help', '6 Help'),
  ].join('  ');
  const navRight = state.notice ? `${COPPER}${clip(state.notice, 28)}${RESET}` : `${MUTED}Ready${RESET}`;
  const nav = pad(navLeft, width - visible(navRight)) + navRight;

  const shortcuts = [
    `${CYAN}Ctrl+K${RESET} Palette`,
    `${CYAN}Ctrl+P${RESET} Models`,
    `${CYAN}Ctrl+W${RESET} Spaces`,
    `${CYAN}Ctrl+R${RESET} Runs`,
    `${CYAN}Ctrl+I${RESET} Insights`,
    `${CYAN}Ctrl+Q${RESET} Quit`,
  ].join('  ');
  const status = `${DIM}${clip(state.host || '127.0.0.1:31338', 16)}${RESET}`;

  // Layout calculation
  const useSplitLayout = width >= 75;
  const leftWidth = useSplitLayout ? Math.min(26, Math.floor(width * 0.28)) : 0;
  const rightWidth = useSplitLayout ? width - leftWidth - 1 : width;
  const availableHeight = Math.max(5, height - 7);

  let bodyLines: string[] = [];

  if (state.overlay !== 'none') {
    let overlayLines: string[] = [];
    if (state.overlay === 'models') overlayLines = renderModelPicker(state, width, availableHeight + 2);
    else if (state.overlay === 'sessions') {
      const rows = filteredSessions(state).map(s => `${s.id === state.sessionId ? `${CYAN}*${RESET} ` : '  '}${BOLD}${s.title}${RESET} ${MUTED}(${s.model || 'default'})${RESET}`);
      overlayLines = paintList(`CHAT SESSIONS (Ctrl+L) - filter: "${state.filter}"`, rows, state.selected, width, availableHeight + 2);
    } else if (state.overlay === 'workspaces') {
      const rows = filteredWorkspaces(state).map(w => `${w.id === state.activeWorkspaceId ? `${GREEN}*${RESET} ` : '  '}${BOLD}${w.name}${RESET}  ${DIM}${w.path}${RESET}`);
      overlayLines = paintList(`EXECUTION WORKSPACES (Ctrl+W) - filter: "${state.filter}"`, rows, state.selected, width, availableHeight + 2);
    } else {
      const rows = filteredPalette(state).map(c => `${BOLD}${CYAN}${clip(c.label, 28)}${RESET}  ${MUTED}${c.hint}${RESET}`);
      overlayLines = paintList(`COMMAND PALETTE (Ctrl+K) - filter: "${state.filter}"`, rows, state.selected, width, availableHeight + 2);
    }
    bodyLines = overlayLines;
  } else {
    let rightLines: string[] = [];

    if (state.view === 'runs') {
      const rows = state.runs.map((r, index) => {
        const active = index === state.runSelectedIndex;
        const pointer = active ? `${CYAN}›${RESET}` : ' ';
        return `${pointer} ${statusPill(r.status)} ${BOLD}${r.id}${RESET}  ${COPPER}${clip(r.model || 'model', 14)}${RESET}  ${TEXT}${clip(r.prompt, rightWidth - 36)}${RESET}`;
      });
      rightLines = [
        `${BOLD}${TEXT}Agent Execution Runs${RESET}  ${MUTED}[Enter] Details  [A] Approve  [C] Continue  [X] Cancel  [R] Retry${RESET}`,
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
        if (s.content) rightLines.push(...wrap(s.content, rightWidth - 4).slice(0, 2).map(l => `  ${TEXT}${l}${RESET}`));
        if (s.events && s.events.length) {
          rightLines.push(`  ${MUTED}Events (${s.events.length}):${RESET}`);
          for (const ev of s.events.slice(-3)) {
            if (ev.kind === 'command') {
              rightLines.push(`    ${COPPER}┌─ ⚡ [command] ${clip(ev.command || '', rightWidth - 20)} ─┐${RESET}`);
              rightLines.push(`    ${COPPER}│${RESET} Exit: ${ev.exitCode ?? 0}  Status: ${ev.status === 'completed' ? `${GREEN}ok${RESET}` : ev.status}`);
              rightLines.push(`    ${COPPER}└──────────────────────────────────────────────┘${RESET}`);
            }
            if (ev.stdout) {
              const outLines = ev.stdout.trim().split('\n');
              for (const ol of outLines.slice(0, 3)) {
                if (ol.startsWith('+')) rightLines.push(`      ${GREEN}${clip(ol, rightWidth - 8)}${RESET}`);
                else if (ol.startsWith('-')) rightLines.push(`      ${RED}${clip(ol, rightWidth - 8)}${RESET}`);
                else if (ol.startsWith('@@')) rightLines.push(`      ${CYAN}${clip(ol, rightWidth - 8)}${RESET}`);
                else rightLines.push(`      ${DIM}${clip(ol, rightWidth - 8)}${RESET}`);
              }
            }
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
        if (state.status === 'streaming' || state.streaming) {
          transcript.push(`${CYAN}conduit${RESET}  ${MUTED}streaming · [${telemetry}]${RESET}`);
          for (const line of wrap(state.streaming, rightWidth - 4)) transcript.push(`  ${TEXT}${line}${RESET}`);
          transcript.push(`${CYAN}${spinner}${RESET} ${MUTED}Receiving tokens (${state.tokenCount || 0} tokens${tps ? ` | ${tps}` : ''})...${RESET}`);
        } else {
          transcript.push(`${CYAN}conduit${RESET}  ${YELLOW}${spinner} Thinking (${elapsed}ms)...${RESET}`);
          if (state.currentTool) {
            transcript.push(`  ${COPPER}⚡ Executing tool: ${state.currentTool.name} ${state.currentTool.target ? `(${state.currentTool.target})` : ''}...${RESET}`);
            transcript.push(`  ${COPPER}┌─ ⚡ Tool Invocation: ${state.currentTool.name} ${state.currentTool.target ? `(${state.currentTool.target})` : ''} ────────────────────${RESET}`);
            transcript.push(`  ${COPPER}│${RESET} ${DIM}Status:${RESET} ${YELLOW}running${RESET}  ${DIM}Duration:${RESET} ${elapsed}ms`);
            transcript.push(`  ${COPPER}└─────────────────────────────────────────────────────${RESET}`);
          }
          if (state.status === 'diff_apply') {
            transcript.push(`  ${GREEN}┌─ 📝 Applying Diff / Workspace Mutation ───────────────────────${RESET}`);
            transcript.push(`  ${GREEN}│${RESET} Status: ${YELLOW}patching workspace files...${RESET}`);
            transcript.push(`  ${GREEN}└─────────────────────────────────────────────────────────────${RESET}`);
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

  const cursorRow = height - 1;
  const cursorCol = state.overlay === 'none' && state.view === 'chat' ? state.cursor + 3 : 1;

  return { lines, cursor: { row: cursorRow, col: cursorCol } };
}

export function renderTui(state: TuiState): string {
  const { lines } = renderTuiLines(state);
  return `\x1b[?25l\x1b[H\x1b[J${lines.join('\n')}`;
}
