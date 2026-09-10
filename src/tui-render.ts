import {
  clampBox,
  fitLine,
  layoutProfile,
  padVisible,
  sliceTranscript,
  tooSmallOverlay,
  visibleWidth,
  wrapAnsi,
} from './tui-layout.js';
import { sanitizeCellText } from './tui-sanitize.js';
import { codePointWidth } from './tui-width.js';
export { stripAnsi, visibleWidth as visible, wrapAnsi, middleTruncate, layoutProfile, tooSmallMessage } from './tui-layout.js';

export type TuiView = 'chat' | 'runs' | 'run-detail' | 'workspaces' | 'insights' | 'git' | 'help';
export type TuiOverlay = 'none' | 'palette' | 'models' | 'sessions' | 'workspaces';
export type TuiInferenceStatus = 'idle' | 'thinking' | 'streaming' | 'tool_execution' | 'diff_apply' | 'waiting_approval' | 'done' | 'error';

export interface TuiTurnMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerSec: number;
  turnCostUsd?: number;
  costBudgetPercent?: number;
}

export interface TuiMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  status?: string;
  metrics?: TuiTurnMetrics;
}

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

export interface TuiPendingApproval {
  runId: string;
  stepId?: string;
  stepName?: string;
  toolName?: string;
  targetFile?: string;
  diff?: string;
  summary?: string;
}

export interface TuiScanProgress {
  total: number;
  scanned: number;
  phase?: string;
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
  contextTokens?: number;
  contextWindowLimit?: number;
  pendingApproval?: TuiPendingApproval;
  scanProgress?: TuiScanProgress;
  lastTurnMetrics?: TuiTurnMetrics;
  history?: string[];
  historyIndex?: number;
  draftInput?: string;
  chatScroll?: number;
  chatStickToBottom?: boolean;
  width: number;
  height: number;
}

export type TuiKey =
  | { type: 'char'; value: string }
  /**
   * A whole bracketed-paste block, delivered as one key.
   *
   * Without this a paste arrives as ordinary keystrokes, so every newline
   * in it becomes `enter`, and `enter` sends. A three-line paste therefore
   * fired two sends and left the third line sitting in the composer.
   */
  | { type: 'paste'; value: string }
  | { type: 'enter' }
  | { type: 'newline' }
  | { type: 'escape' }
  | { type: 'backspace' }
  | { type: 'tab' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'word-left' }
  | { type: 'word-right' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'pageup' }
  | { type: 'pagedown' }
  | { type: 'scroll-up' }
  | { type: 'scroll-down' }
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

export const TUI_COLORS = {
  CYAN,
  COPPER,
  TEXT,
  MUTED,
  GREEN,
  RED,
  YELLOW,
  RESET,
  BOLD,
  DIM,
  REVERSE,
  NORD_BORDER,
  NORD_FROST,
  NORD_ARCTIC,
  NORD_GREEN,
  NORD_PURPLE,
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Render an ANSI-styled dynamic progress bar with filled block characters,
 * empty block characters, and percentage indicator.
 * E.g.: [████████░░░░░░░░] 50%
 */
export function renderProgressBar(percent: number, width = 16, color?: string): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const totalBlocks = Math.max(4, width);
  const filledCount = Math.min(totalBlocks, Math.max(0, Math.round((p / 100) * totalBlocks)));
  const emptyCount = totalBlocks - filledCount;

  const barColor = color || (p < 60 ? GREEN : p <= 85 ? YELLOW : RED);
  const filled = '█'.repeat(filledCount);
  const empty = '░'.repeat(emptyCount);

  return `[${barColor}${filled}${MUTED}${empty}${RESET}] ${p}%`;
}

/**
 * Pre-execution token count estimator based on blended BPE / word heuristics.
 * Accurately estimates prompt token consumption prior to model submission.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const chars = trimmed.length;
  const words = trimmed.split(/\s+/).length;
  const est = Math.max(1, Math.round((chars / 3.8) * 0.6 + (words * 1.3) * 0.4));
  return est;
}

/**
 * Format numeric token counts into human-readable shorthand (e.g. 128k, 1.2M).
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${tokens}`;
}

export function findPrevWord(text: string, cursor: number): number {
  if (cursor <= 0) return 0;
  let i = cursor - 1;
  while (i > 0 && /\s/.test(text[i])) i--;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return Math.max(0, i);
}

export function findNextWord(text: string, cursor: number): number {
  if (cursor >= text.length) return text.length;
  let i = cursor;
  while (i < text.length && !/\s/.test(text[i])) i++;
  while (i < text.length && /\s/.test(text[i])) i++;
  return Math.min(text.length, i);
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
type Cell = { ch: string; style: string; continuation?: boolean };

function tokenizeLine(rawLine: string, width: number): Cell[] {
  // Non-SGR escapes and control bytes are removed here, before anything can
  // become a cell. cellsToAnsi writes cell content back to the terminal
  // verbatim, so a cell holding ESC [ 2 J would clear the screen while `prev`
  // still claimed it was painted, and every later diff would build on that
  // fiction. Model output reaches this function unfiltered via bubble().
  const line = sanitizeCellText(rawLine);
  const cells: Cell[] = [];
  let style = '';
  let i = 0;
  while (i < line.length && cells.length < width) {
    if (line.charCodeAt(i) === 27) {
      const match = line.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (match) {
        style = match[0] === '\x1b[0m' ? '' : match[0];
        i += match[0].length;
        continue;
      }
    }

    // One CELL is one COLUMN. Holding a two-column glyph in a single cell was
    // what made the cell index stop being a column, so the diff addressed
    // `\x1b[row;col+1H` at the wrong place and the cursor landed mid-glyph.
    const point = String.fromCodePoint(line.codePointAt(i) as number);
    const cols = codePointWidth(point.codePointAt(0) as number);
    i += point.length;

    if (cols === 0) {
      // A combining mark belongs to the glyph before it and takes no column of
      // its own. Appending it keeps the pair in one cell so the diff replaces
      // them together; a base with an accent is one visual unit.
      if (cells.length) cells[cells.length - 1].ch += point;
      continue;
    }

    if (cols === 2) {
      // Never split a wide glyph across the right edge: half of it would be
      // drawn and the terminal would wrap the other half onto the next row.
      if (cells.length + 2 > width) {
        cells.push({ ch: ' ', style });
        break;
      }
      cells.push({ ch: point, style });
      // The continuation carries no output. It exists so the array index stays
      // equal to the physical column, and cellsToAnsi skips it.
      cells.push({ ch: '', style, continuation: true });
      continue;
    }

    cells.push({ ch: point, style });
  }
  while (cells.length < width) cells.push({ ch: ' ', style: '' });
  return cells;
}

function cellsToAnsi(cells: Cell[]): string {
  let out = '';
  let style = '';
  for (const cell of cells) {
    // A continuation cell is the second column of a wide glyph. The glyph
    // was already emitted by the cell before it, so writing anything here
    // would push the rest of the line one column to the right.
    if (cell.continuation) continue;
    if (cell.style !== style) {
      out += `\x1b[0m${cell.style}`;
      style = cell.style;
    }
    out += cell.ch;
  }
  return style ? `${out}\x1b[0m` : out;
}

export class TuiDifferentialRenderer {
  private prev: Cell[][] = [];
  private prevWidth = 0;
  private prevHeight = 0;

  render(terminal: TuiTerminalWriter, lines: string[], cursor?: { row: number; col: number }): void {
    const width = terminal.columns;
    const height = terminal.rows;
    const next = Array.from({ length: height }, (_, row) => tokenizeLine(lines[row] ?? '', width));

    // Synchronized Output (DEC private mode 2026). Between BSU and ESU the
    // terminal holds back presentation, so a frame arrives as one visual unit
    // instead of being drawn as the bytes trickle in.
    //
    // Hiding the cursor is not a substitute for this. A frame here averages 722
    // bytes but reaches 12025 at the 400-frame maximum, and 27 of those 400
    // exceeded 4096, which is a common pipe buffer: those arrive in instalments
    // and the terminal paints each instalment. That is the tearing left over
    // once full repaints are gone.
    //
    // Terminals that do not implement 2026 ignore an unknown private mode, so
    // this needs no capability probe and cannot make anything worse.
    let out = '\x1b[?2026h\x1b[?25l';
    const resized = this.prevWidth !== width || this.prevHeight !== height || this.prev.length !== height;
    if (resized) {
      if (this.prevWidth > 0 && this.prevHeight > 0 && (this.prevWidth !== width || this.prevHeight !== height)) {
        out += '\x1b[2J\x1b[H';
      }
      for (let row = 0; row < height; row++) {
        out += `\x1b[${row + 1};1H${cellsToAnsi(next[row])}`;
      }
    } else {
      for (let row = 0; row < height; row++) {
        const before = this.prev[row];
        const after = next[row];
        let col = 0;
        while (col < width) {
          if (before[col].ch === after[col].ch && before[col].style === after[col].style) {
            col += 1;
            continue;
          }
          let end = col + 1;
          while (end < width && (before[end].ch !== after[end].ch || before[end].style !== after[end].style)) end += 1;
          out += `\x1b[${row + 1};${col + 1}H${cellsToAnsi(after.slice(col, end))}`;
          col = end;
        }
      }
    }
    out += cursor ? `\x1b[${cursor.row};${cursor.col}H\x1b[?25h` : '\x1b[?25l';
    // End Synchronized Update: everything above is presented at once. This must
    // be the last thing in the frame, after the cursor is placed, or the cursor
    // move becomes visible on its own.
    out += '\x1b[?2026l';
    this.prev = next;
    this.prevWidth = width;
    this.prevHeight = height;
    terminal.write(out);
  }

  reset(): void {
    this.prev = [];
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

function visible(value: string): number { return visibleWidth(value); }

function pad(value: string, width: number): string {
  return padVisible(value, width);
}

function clip(value: string, width: number): string {
  return fitLine(value, Math.max(0, width));
}

function wrap(value: string, width: number): string[] {
  return wrapAnsi(value, Math.max(1, width));
}

export function decodeKey(seq: string): TuiKey | undefined {
  if (!seq) return undefined;
  if (seq === '\r' || seq === '\n') return { type: 'enter' };
  if (seq === '\x1b\r' || seq === '\x1b\n' || seq === '\x1b[13;2u' || seq === '\x1b[27;2;13~') return { type: 'newline' };
  if (seq === '\x1b') return { type: 'escape' };
  if (seq === '\x7f' || seq === '\b') return { type: 'backspace' };
  if (seq === '\t' || seq === '\x09') return { type: 'tab' };
  if (seq === '\x1b[A' || seq === '\x1bOA') return { type: 'up' };
  if (seq === '\x1b[B' || seq === '\x1bOB') return { type: 'down' };
  if (seq === '\x1b[D' || seq === '\x1bOD') return { type: 'left' };
  if (seq === '\x1b[C' || seq === '\x1bOC') return { type: 'right' };
  if (seq === '\x1b[1;5D' || seq === '\x1b[5D' || seq === '\x1bb') return { type: 'word-left' };
  if (seq === '\x1b[1;5C' || seq === '\x1b[5C' || seq === '\x1bf') return { type: 'word-right' };
  if (seq === '\x1b[H' || seq === '\x1b[1~' || seq === '\x1bOH') return { type: 'home' };
  if (seq === '\x1b[F' || seq === '\x1b[4~' || seq === '\x1bOF') return { type: 'end' };
  if (seq === '\x1b[5~' || seq === '\x1b[5;2~') return { type: 'pageup' };
  if (seq === '\x1b[6~' || seq === '\x1b[6;2~') return { type: 'pagedown' };
  if (seq.startsWith('\x1b[<')) {
    const button = Number((seq.match(/^\x1b\[<(\d+);/) || [])[1]);
    if (button === 64) return { type: 'scroll-up' };
    if (button === 65) return { type: 'scroll-down' };
    return undefined;
  }
  if (seq === '\x0b') return { type: 'ctrl', key: 'k' };
  if (seq === '\x0e') return { type: 'ctrl', key: 'n' };
  if (seq === '\x10') return { type: 'ctrl', key: 'p' };
  if (seq === '\x0c') return { type: 'ctrl', key: 'l' };
  if (seq === '\x17') return { type: 'ctrl', key: 'w' };
  if (seq === '\x12') return { type: 'ctrl', key: 'r' };
  if (seq === '\x07') return { type: 'ctrl', key: 'g' };
  if (seq === '\x08') return { type: 'ctrl', key: 'h' };
  if (seq === '\x05') return { type: 'ctrl', key: 'e' };
  if (seq === '\x04') return { type: 'ctrl', key: 'd' };
  if (seq === '\x11') return { type: 'ctrl', key: 'q' };
  if (seq === '\x03') return { type: 'ctrl', key: 'c' };
  // Any single printable code point, not just ASCII. The old test was
  // `seq >= ' ' && seq <= '~'`, which silently discarded every umlaut, accent,
  // CJK glyph and emoji: the caller consumes the byte either way, so there was
  // no error, no beep and no hint that input had been eaten. Measured on the
  // real loop, a German sentence lost 8 of its 44 code units.
  //
  // Astral characters arrive as a surrogate pair and are passed here whole, so
  // the length test counts code points rather than code units.
  if (isPrintableCodePoint(seq)) return { type: 'char', value: seq };
  return undefined;
}

/** True for exactly one code point that the terminal can display. */
export function isPrintableCodePoint(seq: string): boolean {
  if (!seq) return false;
  const points = [...seq];
  if (points.length !== 1) return false;
  const code = seq.codePointAt(0);
  if (code === undefined) return false;
  // C0, DEL and C1 are handled by the branches above or are not input at all.
  if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return false;
  // A lone surrogate is not a character. It reaches here when a chunk boundary
  // splits a pair, and writing it back produces a replacement glyph or worse.
  // Refusing it keeps the half in the buffer until its partner arrives.
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return true;
}

function insertChar(state: TuiState, char?: string): TuiState {
  if (!char) return state;
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

/**
 * Flatten a pasted block into something a single-line composer can hold.
 *
 * The composer is one line with horizontal scrolling, and the cell
 * sanitiser removes control characters, so a literal newline would vanish
 * without a trace. Turning line breaks into single spaces keeps every word
 * the user pasted and loses only the line structure, which is the smaller
 * loss and the visible one. A multi-line composer is separate work.
 */
export function normalizePaste(value: string): string {
  return value.replace(/\r\n?|\n/g, ' ').replace(/\s{2,}/g, ' ');
}

export function applyTuiKey(state: TuiState, key: TuiKey): { state: TuiState; action: TuiAction; payload?: string } {
  if (key.type === 'paste') {
    const text = normalizePaste(key.value);
    return text ? { state: insertChar(state, text), action: 'none' } : { state, action: 'none' };
  }
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

  // Pending Human-In-The-Loop Approval shortcuts (active when input is empty)
  if (state.pendingApproval && !state.input && state.overlay === 'none' && (state.view === 'chat' || state.view === 'runs' || state.view === 'run-detail')) {
    const approval = state.pendingApproval;
    if (key.type === 'char') {
      const val = key.value.toLowerCase();
      if (val === 'y' || val === 'a') {
        return {
          state: { ...state, pendingApproval: undefined, notice: `Approved run ${approval.runId}` },
          action: 'approve-run',
          payload: approval.runId,
        };
      }
      if (val === 's' || val === 'c') {
        return {
          state: { ...state, pendingApproval: undefined, notice: `Continued run ${approval.runId}` },
          action: 'continue-run',
          payload: approval.runId,
        };
      }
      if (val === 'x') {
        return {
          state: { ...state, pendingApproval: undefined, notice: `Aborted run ${approval.runId}` },
          action: 'cancel-run',
          payload: approval.runId,
        };
      }
      if (val === 'e') {
        const promptSeed = `/continue ${approval.runId} `;
        return {
          state: {
            ...state,
            pendingApproval: undefined,
            input: promptSeed,
            cursor: promptSeed.length,
            notice: 'Enter steering feedback:',
          },
          action: 'none',
        };
      }
    }
  }

  if (state.view === 'runs') {
    if (key.type === 'escape') return { state: { ...state, view: 'chat' }, action: 'none' };
    if (key.type === 'up') return { state: { ...state, runSelectedIndex: Math.max(0, state.runSelectedIndex - 1) }, action: 'none' };
    if (key.type === 'down') return { state: { ...state, runSelectedIndex: Math.min(Math.max(0, state.runs.length - 1), state.runSelectedIndex + 1) }, action: 'none' };
    const currentRun = state.runs[state.runSelectedIndex];
    if (key.type === 'enter' && currentRun) return { state, action: 'view-run', payload: currentRun.id };
    if (key.type === 'char' && (key.value === 'a' || key.value === 'A' || key.value === 'y' || key.value === 'Y') && currentRun) {
      return { state, action: 'approve-run', payload: currentRun.id };
    }
    if (key.type === 'char' && (key.value === 'x' || key.value === 'X') && currentRun) {
      return { state, action: 'cancel-run', payload: currentRun.id };
    }
    if (key.type === 'char' && (key.value === 'c' || key.value === 'C' || key.value === 's' || key.value === 'S') && currentRun) {
      return { state, action: 'continue-run', payload: currentRun.id };
    }
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R') && currentRun) {
      return { state, action: 'retry-run', payload: currentRun.id };
    }
  }

  if (state.view === 'run-detail') {
    if (key.type === 'escape') return { state: { ...state, view: 'runs' }, action: 'none' };
    const detail = state.selectedRunDetail;
    if (key.type === 'char' && (key.value === 'a' || key.value === 'A' || key.value === 'y' || key.value === 'Y') && detail) {
      return { state, action: 'approve-run', payload: detail.id };
    }
    if (key.type === 'char' && (key.value === 'x' || key.value === 'X') && detail) {
      return { state, action: 'cancel-run', payload: detail.id };
    }
    if (key.type === 'char' && (key.value === 'c' || key.value === 'C' || key.value === 's' || key.value === 'S') && detail) {
      return { state, action: 'continue-run', payload: detail.id };
    }
    if (key.type === 'char' && (key.value === 'r' || key.value === 'R') && detail) {
      return { state, action: 'retry-run', payload: detail.id };
    }
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

  if (state.view === 'chat' && state.overlay === 'none') {
    if (key.type === 'pageup' || key.type === 'scroll-up') {
      const step = key.type === 'pageup' ? Math.max(1, (state.height || 24) - 10) : 3;
      return { state: { ...state, chatScroll: (state.chatScroll || 0) + step, chatStickToBottom: false }, action: 'none' };
    }
    if (key.type === 'pagedown' || key.type === 'scroll-down') {
      const step = key.type === 'pagedown' ? Math.max(1, (state.height || 24) - 10) : 3;
      const next = Math.max(0, (state.chatScroll || 0) - step);
      return { state: { ...state, chatScroll: next, chatStickToBottom: next === 0 }, action: 'none' };
    }
  }

  // Prompt History Navigation (Up / Down arrow in Chat view)
  if (state.view === 'chat' && state.overlay === 'none') {
    if (key.type === 'up' && state.history && state.history.length > 0) {
      const history = state.history;
      const currentIdx = state.historyIndex ?? -1;
      const nextIdx = currentIdx + 1;
      if (nextIdx < history.length) {
        const draftInput = currentIdx === -1 ? state.input : (state.draftInput ?? '');
        const historicalText = history[history.length - 1 - nextIdx];
        return {
          state: {
            ...state,
            draftInput,
            historyIndex: nextIdx,
            input: historicalText,
            cursor: historicalText.length,
          },
          action: 'none',
        };
      }
    }
    if (key.type === 'down' && state.historyIndex !== undefined && state.historyIndex >= 0) {
      const history = state.history || [];
      const nextIdx = state.historyIndex - 1;
      if (nextIdx >= 0) {
        const historicalText = history[history.length - 1 - nextIdx];
        return {
          state: {
            ...state,
            historyIndex: nextIdx,
            input: historicalText,
            cursor: historicalText.length,
          },
          action: 'none',
        };
      } else {
        const restored = state.draftInput ?? '';
        return {
          state: {
            ...state,
            historyIndex: -1,
            draftInput: undefined,
            input: restored,
            cursor: restored.length,
          },
          action: 'none',
        };
      }
    }
  }

  // Cursor & Word Jumping
  if (key.type === 'home') return { state: { ...state, cursor: 0 }, action: 'none' };
  if (key.type === 'end') return { state: { ...state, cursor: state.input.length }, action: 'none' };
  if (key.type === 'word-left') return { state: { ...state, cursor: findPrevWord(state.input, state.cursor) }, action: 'none' };
  if (key.type === 'word-right') return { state: { ...state, cursor: findNextWord(state.input, state.cursor) }, action: 'none' };
  if (key.type === 'newline') {
    const before = state.input.slice(0, state.cursor);
    const after = state.input.slice(state.cursor);
    return { state: { ...state, input: before + '\n' + after, cursor: state.cursor + 1 }, action: 'none' };
  }

  if (key.type === 'char' && (key.value === '?' || (key as any).char === '?') && !state.input) return { state: { ...state, view: 'help' }, action: 'none' };
  if (key.type === 'char') return { state: insertChar(state, key.value || (key as any).char), action: 'none' };
  if (key.type === 'backspace') return { state: backspace(state), action: 'none' };
  if (key.type === 'left') return { state: { ...state, cursor: Math.max(0, state.cursor - 1) }, action: 'none' };
  if (key.type === 'right') return { state: { ...state, cursor: Math.min(state.input.length, state.cursor + 1) }, action: 'none' };

  if (key.type === 'enter') {
    if (!state.input.trim()) return { state, action: 'none' };
    const payload = state.input;
    const history = state.history ? [...state.history] : [];
    if (!history.length || history[history.length - 1] !== payload) {
      history.push(payload);
    }
    return {
      state: {
        ...state,
        input: '',
        cursor: 0,
        history,
        historyIndex: -1,
        draftInput: undefined,
      },
      action: 'send',
      payload,
    };
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

function renderApprovalCard(pending: TuiPendingApproval, width: number): string[] {
  const innerWidth = Math.max(20, width - 4);
  const lines: string[] = [
    `${YELLOW}┌─ ⏸ HUMAN-IN-THE-LOOP APPROVAL: Run ${pending.runId} ${'─'.repeat(Math.max(2, innerWidth - 38))}┐${RESET}`,
    `${YELLOW}│${RESET} ${BOLD}Step:${RESET} ${TEXT}${clip(pending.stepName || pending.stepId || 'Approval Checkpoint', innerWidth - 8)}${RESET}`,
    `${YELLOW}│${RESET} ${BOLD}Action:${RESET} ${COPPER}${clip(pending.toolName || 'Tool Execution Gate', innerWidth - 10)}${RESET}`,
  ];
  if (pending.summary) {
    lines.push(`${YELLOW}│${RESET} ${DIM}Summary:${RESET} ${clip(pending.summary, innerWidth - 11)}`);
  }
  if (pending.diff) {
    lines.push(`${YELLOW}│${RESET} ${DIM}Diff Preview:${RESET}`);
    const diffLines = pending.diff.trim().split('\n').slice(0, 4);
    for (const dl of diffLines) {
      if (dl.startsWith('+')) lines.push(`${YELLOW}│${RESET}   ${GREEN}${clip(dl, innerWidth - 6)}${RESET}`);
      else if (dl.startsWith('-')) lines.push(`${YELLOW}│${RESET}   ${RED}${clip(dl, innerWidth - 6)}${RESET}`);
      else lines.push(`${YELLOW}│${RESET}   ${DIM}${clip(dl, innerWidth - 6)}${RESET}`);
    }
  }
  lines.push(`${YELLOW}├${'─'.repeat(innerWidth + 2)}┤${RESET}`);
  lines.push(`${YELLOW}│${RESET} ${BOLD}[y]${RESET} Approve  ${BOLD}[e]${RESET} Edit/Feedback  ${BOLD}[s]${RESET} Skip step  ${BOLD}[c]${RESET} Abort`);
  lines.push(`${YELLOW}└${'─'.repeat(innerWidth + 2)}┘${RESET}`);
  return lines;
}

const BOX = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', ml: '├', mr: '┤', tm: '┬', bm: '┴' };

function boxTop(width: number, title: string, right = ''): string {
  const inner = Math.max(8, width - 2);
  const left = `${BOX.h} ${title} `;
  const tail = right ? ` ${right} ${BOX.h}` : BOX.h;
  const fill = Math.max(0, inner - visible(left) - visible(tail));
  return `${NORD_BORDER}${BOX.tl}${left}${BOX.h.repeat(fill)}${tail}${BOX.tr}${RESET}`;
}

function boxBottom(width: number, footer = ''): string {
  const inner = Math.max(8, width - 2);
  const text = footer ? ` ${footer} ` : '';
  const fill = Math.max(0, inner - visible(text));
  return `${NORD_BORDER}${BOX.bl}${BOX.h.repeat(fill)}${text}${BOX.br}${RESET}`;
}

function boxRow(width: number, content: string): string {
  const inner = Math.max(1, width - 2);
  return `${NORD_BORDER}${BOX.v}${RESET}${clip(' ' + content, inner)}${NORD_BORDER}${BOX.v}${RESET}`;
}

function bubble(role: 'user' | 'assistant', body: string, width: number, meta = ''): string[] {
  const color = role === 'user' ? CYAN : NORD_PURPLE;
  const title = role === 'user' ? 'you' : 'conduit';
  const inner = Math.max(10, width - 2);
  const head = `${color}${BOX.tl}${BOX.h} ${BOLD}${title}${RESET}${color} ${meta}${BOX.h.repeat(Math.max(0, inner - visible(`${title} ${meta}`) - 3))}${BOX.tr}${RESET}`;
  const rows = wrap(body, inner - 2).map(line => `${color}${BOX.v}${RESET} ${TEXT}${pad(line, inner - 2)}${RESET}${color}${BOX.v}${RESET}`);
  const foot = `${color}${BOX.bl}${BOX.h.repeat(inner)}${BOX.br}${RESET}`;
  return [head, ...rows, foot];
}

function renderTabStrip(state: TuiState, width: number): string {
  const tabs: Array<[TuiView, string]> = [
    ['chat', 'Chat'],
    ['runs', 'Runs'],
    ['workspaces', 'Spaces'],
    ['insights', 'Insights'],
    ['git', 'Git'],
    ['help', 'Help'],
  ];
  const painted = tabs.map(([id, label]) => {
    const active = state.view === id || (id === 'runs' && state.view === 'run-detail');
    return active ? `${REVERSE}${CYAN} ${label} ${RESET}` : `${MUTED} ${label} ${RESET}`;
  }).join('');
  return fitLine(`${MUTED}Tab${RESET}${painted}  ${DIM}Ctrl+W sidebar${RESET}`, width);
}

function composerLine(state: TuiState, inner: number): string {
  if (state.overlay !== 'none') return `${MUTED}filter:${RESET} ${state.filter}`;
  if (state.view !== 'chat') return `${MUTED}${state.view}  Esc returns to chat${RESET}`;
  const prefix = `${COPPER}>${RESET} `;
  const avail = Math.max(1, inner - 3);
  const text = state.input;
  let start = 0;
  if (text.length + 1 > avail) start = Math.max(0, state.cursor - avail + 1);
  const before = text.slice(start, state.cursor);
  const after = text.slice(state.cursor, start + avail);
  return `${prefix}${before}${REVERSE} ${RESET}${after}`;
}

export function renderTuiLines(state: TuiState): { lines: string[]; cursor?: { row: number; col: number } } {
  const width = Math.max(1, state.width || 80);
  const height = Math.max(1, state.height || 24);
  const profile = layoutProfile(width, height);
  if (profile.tooSmall) return { lines: tooSmallOverlay(width, height) };

  const activeWs = state.workspaces.find(w => w.id === state.activeWorkspaceId) || state.workspaces[0];
  const wsLabel = activeWs ? activeWs.name : 'default';
  const gitLabel = state.git.detected ? `${state.git.branch}${state.git.files ? `* (${state.git.files})` : ''}` : 'clean';
  const latency = state.latencyMs ? `${state.latencyMs}ms` : '22ms';

  const spinner = SPINNER_FRAMES[(state.spinnerFrame || 0) % SPINNER_FRAMES.length];
  const elapsed = state.busyStartTime ? Date.now() - state.busyStartTime : 0;
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const tps = state.tokensPerSec !== undefined ? `${state.tokensPerSec} t/s` : '';
  const telemetry = [state.model, `${elapsedSec}s`, tps].filter(Boolean).join(' | ');

  const contextTokens = state.contextTokens ?? state.messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  const contextLimit = state.contextWindowLimit ?? 128_000;
  const contextPct = Math.min(100, Math.round((contextTokens / contextLimit) * 100));
  const contextBar = renderProgressBar(contextPct, profile.mode === 'large' && profile.headerRows === 2 ? 8 : 4);
  const noticeBit = state.notice && state.notice !== 'Ready' ? `  ${COPPER}${clip(state.notice, 24)}${RESET}` : '';
  const connected = `${GREEN}●${RESET} Connected: ${state.host || '127.0.0.1:31338'}`;
  const compactTags = `Ctx:${contextBar} ${formatTokenCount(contextTokens)}/${formatTokenCount(contextLimit)}  ${COPPER}${clip(state.model, 16).trim()}${RESET}  ${latency}`;
  const fullNav = `Ctx:${contextBar} ${formatTokenCount(contextTokens)}/${formatTokenCount(contextLimit)}  ${TEXT}Workspace:${RESET} ${COPPER}${clip(wsLabel, 12)}${RESET} [git:${GREEN}${clip(gitLabel, 12)}${RESET}]  ${TEXT}Model:${RESET} ${COPPER}${clip(state.model, 18)}${RESET}  ${latency}${noticeBit}`;
  const headerLines = profile.headerRows === 1
    ? [boxTop(width, `${BOLD}${CYAN}CONDUIT BRIDGE${RESET}`, compactTags)]
    : [
      boxTop(width, `${BOLD}${CYAN}CONDUIT BRIDGE${RESET} ${DIM}v0.10${RESET}`, connected),
      boxRow(width, profile.mode === 'large' ? fullNav : compactTags + noticeBit),
    ];

  const useSplitLayout = profile.sidebar > 0;
  const leftWidth = profile.sidebar;
  const rightWidth = useSplitLayout ? Math.max(8, width - leftWidth - 1) : width;
  const tabLines = profile.mode === 'small' ? [renderTabStrip(state, width)] : [];
  const availableHeight = Math.max(1, height - headerLines.length - tabLines.length - 3);

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
        const stepProgress = r.stepsCount ? ` ${renderProgressBar(Math.min(100, r.stepsCount * 20), 8)}` : '';
        return `${pointer} ${statusPill(r.status)} ${BOLD}${r.id}${RESET}${stepProgress}  ${COPPER}${clip(r.model || 'model', 14)}${RESET}  ${TEXT}${clip(r.prompt, rightWidth - 40)}${RESET}`;
      });
      rightLines = [
        `${BOLD}${TEXT}Agent Execution Runs${RESET}  ${MUTED}[Enter] Details  [A/Y] Approve  [C/S] Continue  [X] Cancel  [R] Retry${RESET}`,
        `${MUTED}${'─'.repeat(Math.max(8, rightWidth - 2))}${RESET}`,
        ...(rows.length ? rows.slice(0, availableHeight - 2) : [`${MUTED}  No execution runs found. Start one with /run <prompt>${RESET}`]),
      ];
    } else if (state.view === 'run-detail' && state.selectedRunDetail) {
      const d = state.selectedRunDetail;
      const completedSteps = d.steps.filter(s => s.status === 'completed' || s.status === 'succeeded').length;
      const stepPct = d.steps.length ? Math.round((completedSteps / d.steps.length) * 100) : 0;
      const stepBar = renderProgressBar(stepPct, 12, COPPER);

      rightLines = [
        `${BOLD}${TEXT}Run Detail:${RESET} ${d.id}  ${statusPill(d.status)}  ${COPPER}${d.model}${RESET}`,
        `${MUTED}Tokens: ${d.tokensConsumed}  Cost: $${d.costUsd.toFixed(4)}  ${BOLD}Progress:${RESET} ${stepBar} (${completedSteps}/${d.steps.length} steps)${RESET}`,
        `${BOLD}Prompt:${RESET} ${d.prompt}`,
        `${MUTED}${'─'.repeat(Math.max(8, rightWidth - 2))}${RESET}`,
      ];

      if (d.status === 'waiting_approval' || state.pendingApproval?.runId === d.id) {
        const approval = state.pendingApproval || { runId: d.id, summary: 'Run requires human operator confirmation before continuing' };
        rightLines.push(...renderApprovalCard(approval, rightWidth - 2));
      }

      for (const s of d.steps) {
        const stepPill = s.status === 'completed' ? `${GREEN}●${RESET}` : s.status === 'running' ? `${YELLOW}◐${RESET}` : `${MUTED}○${RESET}`;
        rightLines.push(`  ${stepPill} ${BOLD}Step ${s.iteration}:${RESET} [${s.status}]`);
        if (s.content) rightLines.push(...wrap(s.content, rightWidth - 6).slice(0, 2).map(l => `    ${TEXT}${l}${RESET}`));
        if (s.events && s.events.length) {
          rightLines.push(`    ${MUTED}Events (${s.events.length}):${RESET}`);
          for (const ev of s.events.slice(-3)) {
            if (ev.kind === 'command') {
              rightLines.push(`      ${COPPER}┌─ ⚡ [command] ${clip(ev.command || '', rightWidth - 24)} ─┐${RESET}`);
              rightLines.push(`      ${COPPER}│${RESET} Exit: ${ev.exitCode ?? 0}  Status: ${ev.status === 'completed' ? `${GREEN}ok${RESET}` : ev.status}`);
              rightLines.push(`      ${COPPER}└──────────────────────────────────────────────┘${RESET}`);
            }
            if (ev.stdout) {
              const outLines = ev.stdout.trim().split('\n');
              for (const ol of outLines.slice(0, 3)) {
                if (ol.startsWith('+')) rightLines.push(`        ${GREEN}${clip(ol, rightWidth - 10)}${RESET}`);
                else if (ol.startsWith('-')) rightLines.push(`        ${RED}${clip(ol, rightWidth - 10)}${RESET}`);
                else if (ol.startsWith('@@')) rightLines.push(`        ${CYAN}${clip(ol, rightWidth - 10)}${RESET}`);
                else rightLines.push(`        ${DIM}${clip(ol, rightWidth - 10)}${RESET}`);
              }
            }
          }
        }
      }
      rightLines.push(`${MUTED}[Esc] Back to runs  [A/Y] Approve  [C/S] Continue  [X] Cancel  [R] Retry${RESET}`);
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
        `${CYAN}Ctrl+K${RESET} command palette    ${CYAN}Ctrl+P${RESET} models (fuzzy)   ${CYAN}Ctrl+W${RESET} spaces`,
        `${CYAN}Ctrl+R${RESET} runs   ${CYAN}Ctrl+I${RESET} insights   ${CYAN}Ctrl+G${RESET} git   ${CYAN}Ctrl+Q${RESET} quit`,
        `${CYAN}Ctrl+Left/Right${RESET} word jump    ${CYAN}Up/Down${RESET} prompt history`,
        `${BOLD}${TEXT}Execution & Approval Controls:${RESET}`,
        `${CYAN}[y]${RESET} approve   ${CYAN}[e]${RESET} edit/steer   ${CYAN}[s]${RESET} skip step   ${CYAN}[c]${RESET} cancel`,
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

      // Scan progressbar indicator if active
      if (state.scanProgress) {
        const scanPct = Math.round((state.scanProgress.scanned / Math.max(1, state.scanProgress.total)) * 100);
        const scanBar = renderProgressBar(scanPct, 12, CYAN);
        transcript.push(`  ${CYAN}⚡ [Codebase Scan]${RESET} ${scanBar} ${state.scanProgress.scanned}/${state.scanProgress.total} files (${state.scanProgress.phase || 'indexing'})`);
        transcript.push('');
      }

      for (const message of state.messages) {
        const meta = message.model ? `${MUTED}${message.model}${RESET}` : '';
        transcript.push(...bubble(message.role, message.content, Math.max(24, rightWidth - 2), meta));
        if (message.metrics) {
          const m = message.metrics;
          const costStr = m.turnCostUsd !== undefined ? ` | Cost: $${m.turnCostUsd.toFixed(4)}` : '';
          const budgetStr = m.costBudgetPercent !== undefined ? ` (${m.costBudgetPercent}% budget)` : '';
          transcript.push(`  ${DIM}Tokens: in=${m.inputTokens} out=${m.outputTokens} tot=${m.totalTokens} | ${m.tokensPerSec} tok/s${costStr}${budgetStr}${RESET}`);
        }
        transcript.push('');
      }

      // Pending Human-In-The-Loop Approval card
      if (state.pendingApproval) {
        transcript.push(...renderApprovalCard(state.pendingApproval, rightWidth - 4));
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
      const scrollOffset = state.chatStickToBottom === false ? (state.chatScroll || 0) : 0;
      rightLines = sliceTranscript(transcript, availableHeight, scrollOffset).view;
    }

    if (useSplitLayout) {
      const leftTree: string[] = [
        `${BOLD}${TEXT}${profile.mode === 'large' ? 'WORKSPACES & SESSIONS' : 'WORKSPACES'}${RESET}`,
        `${MUTED}▼ Workspaces${RESET}`,
        `  ${GREEN}●${RESET} ${clip(wsLabel, Math.max(4, leftWidth - 6))}`,
        `${MUTED}▼ Active Runs (${state.runs.length})${RESET}`,
        `  ${state.busy ? `${CYAN}◐${RESET}` : `${GREEN}●${RESET}`} ${state.busy ? 'running' : 'idle'}`,
        `${MUTED}▼ Local Insights${RESET}`,
        `  ${clip(`${state.insights?.length || 0} items`, Math.max(4, leftWidth - 4))}`,
        `${MUTED}▼ Chat Sessions${RESET}`,
        `  ${CYAN}›${RESET} ${clip(state.sessionTitle || 'CLI chat', Math.max(4, leftWidth - 6))}`,
        `${MUTED}▼ Git [${clip(state.git.branch || 'main', 8)}]${RESET}`,
        `  ${state.git.files ? `${COPPER}[+${state.git.files} ~0 -0]${RESET}` : `${GREEN}clean${RESET}`}`,
        `${MUTED}Agent Runs${RESET}`,
        `  ${clip(String(state.runs.length), 4)} queued/live`,
      ];

      bodyLines = Array.from({ length: availableHeight }, (_, i) => (
        clip(leftTree[i] ?? '', leftWidth) + `${NORD_BORDER}│${RESET}` + clip(' ' + (rightLines[i] ?? ''), rightWidth)
      ));
    } else {
      bodyLines = clampBox(rightLines, rightWidth, availableHeight);
    }
  }

  const promptTok = estimateTokens(state.input);
  const projTok = contextTokens + promptTok;
  const projPct = Math.min(100, Math.round((projTok / contextLimit) * 100));
  const promptMeta = state.input.trim()
    ? `Prompt: ~${promptTok} tok | Projected: ~${formatTokenCount(projTok)} (${projPct}%)`
    : state.notice && state.notice !== 'Ready'
      ? clip(state.notice, 42)
      : `${state.busy ? 'streaming' : 'idle'}`;
  const inputBody = composerLine(state, Math.max(1, width - 2));
  const footerTop = boxTop(width, `PROMPT [Mode: ${state.view === 'chat' ? 'Chat' : state.view}]`, promptMeta);
  const footerMid = boxRow(width, inputBody);
  const footerHints = profile.footerHints === 'compact'
    ? `${CYAN}Ctrl+K${RESET} Palette  ${CYAN}Ctrl+P${RESET} Model  ${CYAN}Ctrl+Q${RESET} Quit`
    : `${CYAN}Ctrl+K${RESET} Palette  ${CYAN}Ctrl+P${RESET} Model  ${CYAN}Ctrl+W${RESET} Spaces  ${CYAN}Ctrl+R${RESET} Runs  ${CYAN}Ctrl+I${RESET} Insights`;
  const footerBot = boxBottom(width, footerHints);

  const assembled = [
    ...headerLines,
    ...tabLines,
    ...clampBox(bodyLines, width, availableHeight),
    footerTop,
    footerMid,
    footerBot,
  ];
  const lines = clampBox(assembled, width, height);

  const cursorRow = height - 1;
  const avail = Math.max(1, width - 5);
  let start = 0;
  if (state.input.length + 1 > avail) start = Math.max(0, state.cursor - avail + 1);
  const cursorCol = state.overlay === 'none' && state.view === 'chat' ? 5 + (state.cursor - start) : 3;

  return { lines, cursor: { row: cursorRow, col: Math.min(width, Math.max(1, cursorCol)) } };
}

export function renderTui(state: TuiState): string {
  const { lines } = renderTuiLines(state);
  return `\x1b[?25l\x1b[H\x1b[J${lines.join('\n')}`;
}
