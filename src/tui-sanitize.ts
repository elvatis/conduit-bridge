/**
 * Cell-grid input sanitiser.
 *
 * Everything that ends up in a frame passes through a tokeniser that turns a
 * string into fixed cells, and whatever a cell holds is written back to the
 * terminal verbatim. Before this module existed, both tokenisers recognised
 * SGR and nothing else, so any other control byte in the text became a cell
 * and was replayed onto the stream. Model output reaches those tokenisers
 * unfiltered, which means a reply containing ESC [ 2 J cleared the screen
 * while the differential renderer went on believing the screen still matched
 * its `prev` grid. Every later frame then diffed against a fiction, and the
 * damage stayed until the next resize because nothing forces a full repaint.
 *
 * The invariant this module establishes, and the reason it sits at the
 * tokenisers rather than at the model boundary: A CELL NEVER HOLDS A CONTROL
 * CHARACTER. Filtering at the model boundary would protect only the paths
 * someone remembered to route through it; filtering here covers every current
 * and future caller, because a cell grid is the only way content reaches the
 * screen.
 *
 * SGR is deliberately preserved: it carries colour, it cannot move the cursor,
 * erase, or switch buffers, and the renderer depends on it.
 */

/** Tabs become spaces rather than vanishing, so indentation survives. */
export const TAB_WIDTH = 4;

/** Matches a Select Graphic Rendition sequence, the one form we keep. */
const SGR = /^\x1b\[[0-9;]*m/;

/**
 * Length of the escape sequence starting at `i`, or 0 if there is none.
 * Returns the full length so the caller can drop the sequence whole; leaving
 * the tail behind would put "[2J" on screen as literal text instead.
 */
function escapeLength(value: string, i: number): number {
  if (value.charCodeAt(i) !== 0x1b) return 0;
  const next = value[i + 1];
  if (next === undefined) return 1; // dangling ESC at end of input

  // CSI: ESC [ params intermediates final(0x40-0x7E)
  if (next === '[') {
    let j = i + 2;
    while (j < value.length) {
      const code = value.charCodeAt(j);
      if (code >= 0x40 && code <= 0x7e) return j - i + 1;
      j += 1;
    }
    return value.length - i; // unterminated: drop the remainder
  }

  // OSC: ESC ] ... terminated by BEL or ST (ESC \)
  if (next === ']') {
    let j = i + 2;
    while (j < value.length) {
      if (value.charCodeAt(j) === 0x07) return j - i + 1;
      if (value.charCodeAt(j) === 0x1b && value[j + 1] === '\\') return j - i + 2;
      j += 1;
    }
    return value.length - i;
  }

  // DCS, SOS, PM, APC: ESC P/X/^/_ ... ST
  if (next === 'P' || next === 'X' || next === '^' || next === '_') {
    let j = i + 2;
    while (j < value.length) {
      if (value.charCodeAt(j) === 0x1b && value[j + 1] === '\\') return j - i + 2;
      j += 1;
    }
    return value.length - i;
  }

  // Two-character escape, for example ESC c (full reset) or ESC 7 (save cursor).
  return 2;
}

/** True for C0 controls, DEL and C1 controls. None of these may become a cell. */
function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}

/**
 * Strip every escape sequence except SGR, and every remaining control
 * character, from text that is about to be turned into cells.
 *
 * This is not an escaping function: nothing is made visible as text. A cleared
 * screen and a literal "[2J" in the transcript are both wrong, and the second
 * is merely quieter.
 */
export function sanitizeCellText(value: string): string {
  // Fast path. Untrusted content is the exception, and scanning every frame
  // line character by character would show up in the frame budget.
  if (!/[\x00-\x1f\x7f-\x9f]/.test(value)) return value;

  let out = '';
  let i = 0;
  while (i < value.length) {
    const code = value.charCodeAt(i);

    if (code === 0x1b) {
      const sgr = value.slice(i).match(SGR);
      if (sgr) {
        out += sgr[0];
        i += sgr[0].length;
        continue;
      }
      i += escapeLength(value, i) || 1;
      continue;
    }

    if (code === 0x09) {
      out += ' '.repeat(TAB_WIDTH);
      i += 1;
      continue;
    }

    if (isControl(code)) {
      i += 1; // dropped, not replaced: a placeholder would shift every column
      continue;
    }

    out += value[i];
    i += 1;
  }
  return out;
}
