/**
 * Terminal column width of a code point.
 *
 * The renderer measured text with String.length, which counts UTF-16 code
 * units. A terminal counts columns, and the two disagree in three ways that all
 * appeared on screen:
 *
 *   - East Asian glyphs and emoji occupy TWO columns but one code unit, so a
 *     CJK sentence measured 19 against 38 real columns. padVisible then padded
 *     an already overfull line and made it worse.
 *   - Combining marks occupy ZERO columns but one code unit, so a line with
 *     accents measured wider than it drew and the right border landed short.
 *   - Astral code points occupy one column position but TWO code units, so the
 *     count ran ahead of the glyphs.
 *
 * The second consumer is the differential renderer, which addresses absolute
 * columns as `\x1b[row;col+1H` using the cell index. With a two-column glyph
 * held in a single cell, that index stops being a column and the cursor lands
 * mid-glyph. Emitting a continuation cell for the second half keeps index and
 * column identical, so one representation fixes the measurement and the
 * addressing together.
 *
 * The table below is Unicode 15 East Asian Wide and Fullwidth plus the emoji
 * that default to emoji presentation. It is deliberately a table and not a
 * heuristic: a guess here is invisible until a user pastes a language nobody
 * tested.
 */

/** Ranges whose code points take no column at all. */
const ZERO: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // combining diacritical marks
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x0e31, 0x0e31],
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x1160, 0x11ff], // Hangul Jamo medial and final, composed onto the initial
  [0x135d, 0x135f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f], // zero width space through right-to-left mark
  [0x2060, 0x2064],
  [0x20d0, 0x20f0], // combining marks for symbols
  [0xfe00, 0xfe0f], // variation selectors
  [0xfe20, 0xfe2f],
  [0xfeff, 0xfeff], // byte order mark
  [0x1f3fb, 0x1f3ff], // skin tone modifiers, applied to the preceding glyph
  [0xe0100, 0xe01ef],
];

/** Ranges whose code points take two columns. */
const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo initial
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1], // high voltage, four occurrences in this repository's own UI
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x303e], // CJK radicals through CJK symbols, minus the ideographic space below
  [0x3041, 0x33ff], // kana, Bopomofo, Hangul compatibility jamo, CJK compatibility
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f320],
  [0x1f32d, 0x1f335],
  [0x1f337, 0x1f37c],
  [0x1f37e, 0x1f393],
  [0x1f3a0, 0x1f3ca],
  [0x1f3cf, 0x1f3d3],
  [0x1f3e0, 0x1f3f0],
  [0x1f3f4, 0x1f3f4],
  [0x1f3f8, 0x1f43e],
  [0x1f440, 0x1f440],
  [0x1f442, 0x1f4fc],
  [0x1f4ff, 0x1f53d],
  [0x1f54b, 0x1f54e],
  [0x1f550, 0x1f567],
  [0x1f57a, 0x1f57a],
  [0x1f595, 0x1f596],
  [0x1f5a4, 0x1f5a4],
  [0x1f5fb, 0x1f64f],
  [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc],
  [0x1f6d0, 0x1f6d2],
  [0x1f6eb, 0x1f6ec],
  [0x1f910, 0x1f9ff],
  [0x20000, 0x3fffd], // CJK extension B and beyond
];

function inRanges(code: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  // Binary search: this runs per code point on every frame line.
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (code < start) hi = mid - 1;
    else if (code > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Columns a single code point occupies: 0, 1 or 2.
 *
 * Control characters report 0 rather than throwing, because the sanitiser
 * removes them before this is reached and a measurement helper is the wrong
 * place to enforce that.
 */
export function codePointWidth(code: number): 0 | 1 | 2 {
  if (code === 0) return 0;
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return 0;
  if (inRanges(code, ZERO)) return 0;
  if (inRanges(code, WIDE)) return 2;
  return 1;
}

/** Columns a whole string occupies. Escape sequences must already be gone. */
export function stringWidth(value: string): number {
  let total = 0;
  for (const char of value) total += codePointWidth(char.codePointAt(0) as number);
  return total;
}
