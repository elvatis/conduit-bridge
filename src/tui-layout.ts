const SGR_RE = /^\x1b\[([0-9;]*)m/;

export type LayoutMode = 'tiny' | 'small' | 'medium' | 'large';

export interface LayoutProfile {
  mode: LayoutMode;
  tooSmall: boolean;
  sidebar: number;
  headerRows: 1 | 2;
  footerHints: 'full' | 'compact';
  minWidth: number;
  minHeight: number;
}

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*[A-Za-z~]?/g, '');
}

export function visibleWidth(value: string): number {
  return stripAnsi(value).length;
}

export function layoutProfile(width: number, height: number): LayoutProfile {
  const cols = Math.max(0, width | 0);
  const rows = Math.max(0, height | 0);
  const tooSmall = cols < 60 || rows < 15;
  const mode: LayoutMode = tooSmall ? 'tiny' : cols < 80 ? 'small' : cols < 120 ? 'medium' : 'large';
  const sidebar = mode === 'large' ? Math.min(28, Math.max(25, Math.floor(cols * 0.22))) : mode === 'medium' ? 20 : 0;
  return {
    mode,
    tooSmall,
    sidebar,
    headerRows: rows < 25 ? 1 : 2,
    footerHints: rows < 25 ? 'compact' : 'full',
    minWidth: 60,
    minHeight: 15,
  };
}

export function tooSmallMessage(cols: number, rows: number): string {
  return `Terminal window too small: ${cols}x${rows}. Please resize to at least 60x15.`;
}

export function tooSmallOverlay(cols: number, rows: number): string[] {
  const width = Math.max(1, cols | 0);
  const height = Math.max(1, rows | 0);
  const wrapped = wrapAnsi(tooSmallMessage(width, height), width);
  const start = Math.max(0, Math.floor((height - wrapped.length) / 2));
  return Array.from({ length: height }, (_, row) => {
    const line = wrapped[row - start];
    if (line === undefined) return ' '.repeat(width);
    const padLeft = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
    return fitLine(`${' '.repeat(padLeft)}${line}`, width);
  });
}

interface Cell {
  ch: string;
  open: string;
}

function applySgr(open: string, codes: string): string {
  if (!codes || codes === '0') return '';
  const parts = codes.split(';').filter(Boolean);
  if (parts.includes('0')) return parts.filter(code => code !== '0').length ? `\x1b[${parts.filter(code => code !== '0').join(';')}m` : '';
  return `${open}\x1b[${codes}m`;
}

function cellsFrom(value: string): Cell[] {
  const cells: Cell[] = [];
  let open = '';
  let i = 0;
  while (i < value.length) {
    const match = value.slice(i).match(SGR_RE);
    if (match) {
      open = applySgr(open, match[1] ?? '0');
      i += match[0].length;
      continue;
    }
    cells.push({ ch: value[i], open });
    i += 1;
  }
  return cells;
}

function cellsToString(cells: Cell[]): string {
  if (!cells.length) return '';
  let out = '';
  let style = '';
  for (const cell of cells) {
    if (cell.open !== style) {
      out += `\x1b[0m${cell.open}`;
      style = cell.open;
    }
    out += cell.ch;
  }
  return style ? `${out}\x1b[0m` : out;
}

export function middleTruncate(value: string, width: number): string {
  const cells = cellsFrom(value);
  if (width <= 0) return '';
  if (cells.length <= width) return cellsToString(cells);
  if (width <= 3) return cellsToString(cells.slice(0, width));
  const plain = cells.map(cell => cell.ch).join('');
  const pathish = /[/\\]/.test(plain);
  if (pathish && width >= 8) {
    const slash = Math.max(plain.lastIndexOf('/'), plain.lastIndexOf('\\'));
    const file = slash >= 0 ? cells.slice(slash + 1) : cells.slice(-Math.min(6, width - 4));
    const ellipsis = '...';
    const budget = width - ellipsis.length - file.length;
    if (budget >= 1 && file.length + ellipsis.length < width) {
      const head = cells.slice(0, budget);
      return cellsToString(head) + ellipsis + cellsToString(file);
    }
  }
  const keep = width - 3;
  const tail = Math.max(1, Math.min(keep - 1, Math.floor(keep * 0.35)));
  const head = Math.max(1, keep - tail);
  return cellsToString(cells.slice(0, head)) + '...' + cellsToString(cells.slice(cells.length - tail));
}

function wordUnits(word: Cell[]): Cell[][] {
  const units: Cell[][] = [];
  let acc: Cell[] = [];
  for (const cell of word) {
    acc.push(cell);
    if (cell.ch === '-') {
      units.push(acc);
      acc = [];
    }
  }
  if (acc.length) units.push(acc);
  return units.length ? units : [word];
}

export function wrapAnsi(value: string, width: number): string[] {
  const limit = Math.max(1, width | 0);
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    const cells = cellsFrom(paragraph);
    let line: Cell[] = [];
    const flush = () => {
      while (line.length && line[line.length - 1].ch === ' ') line.pop();
      lines.push(cellsToString(line));
      line = [];
    };
    let i = 0;
    while (i < cells.length) {
      if (cells[i].ch === ' ') {
        if (!line.length) { i += 1; continue; }
        if (line.length + 1 > limit) { flush(); continue; }
        line.push(cells[i]);
        i += 1;
        continue;
      }
      let j = i;
      while (j < cells.length && cells[j].ch !== ' ') j += 1;
      for (const unit of wordUnits(cells.slice(i, j))) {
        if (unit.length > limit) {
          if (line.length) flush();
          lines.push(middleTruncate(cellsToString(unit), limit));
          continue;
        }
        if (line.length + unit.length > limit) flush();
        line.push(...unit);
      }
      i = j;
    }
    if (line.length) flush();
  }
  return lines.length ? lines : [''];
}

export function fitLine(value: string, width: number): string {
  const limit = Math.max(0, width | 0);
  if (limit === 0) return '';
  if (visibleWidth(value) <= limit) return padVisible(value, limit);
  return padVisible(wrapAnsi(value, limit)[0] ?? '', limit);
}

export function padVisible(value: string, width: number): string {
  const extra = width - visibleWidth(value);
  return extra > 0 ? value + ' '.repeat(extra) : value;
}

export function clampBox(lines: string[], width: number, height: number): string[] {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  return Array.from({ length: h }, (_, index) => fitLine(lines[index] ?? '', w));
}

export function sliceTranscript(lines: string[], room: number, scrollFromBottom: number): { view: string[]; offset: number; maxScroll: number } {
  const height = Math.max(0, room | 0);
  const maxScroll = Math.max(0, lines.length - height);
  const offset = Math.max(0, Math.min(maxScroll, scrollFromBottom | 0));
  const end = lines.length - offset;
  const start = Math.max(0, end - height);
  const view = lines.slice(start, end);
  while (view.length < height) view.unshift('');
  return { view, offset, maxScroll };
}
