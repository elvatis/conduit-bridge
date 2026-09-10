import { describe, expect, it } from 'vitest';
import { codePointWidth, stringWidth } from '../src/tui-width.js';
import { clampBox, visibleWidth, wrapAnsi } from '../src/tui-layout.js';
import { TuiDifferentialRenderer, type TuiTerminalWriter } from '../src/tui-render.js';

/**
 * Width used to be String.length, which counts UTF-16 code units rather than
 * terminal columns. Three separate on-screen defects came out of that single
 * definition, and all three are asserted here rather than only the measurement
 * helper, because a correct helper nobody calls fixes nothing.
 */

const cp = (ch: string) => codePointWidth(ch.codePointAt(0) as number);

describe('codePointWidth', () => {
  it('counts East Asian glyphs as two columns', () => {
    expect(cp('你')).toBe(2);
    expect(cp('あ')).toBe(2);
    expect(cp('한')).toBe(2);
  });

  it('counts the emoji this UI actually uses as two columns', () => {
    // U+26A1 appears four times in tui-render.ts and was the glyph that made
    // every layout exactly one column too wide.
    expect(cp('⚡')).toBe(2);
    expect(cp('\u{1F680}')).toBe(2);
  });

  it('counts combining marks as zero columns', () => {
    expect(cp('́')).toBe(0);
    expect(cp('️')).toBe(0);
  });

  it('counts ordinary text as one column', () => {
    expect(cp('a')).toBe(1);
    expect(cp('ä')).toBe(1);
    expect(cp('Ж')).toBe(1);
  });
});

describe('stringWidth measures columns, not code units', () => {
  it('reports twice the glyph count for CJK, which is what the terminal draws', () => {
    // Built rather than typed, so the glyph count is a fact and not a guess.
    const sentence = '测'.repeat(19);
    expect([...sentence]).toHaveLength(19);
    expect(sentence.length).toBe(19); // what the old definition returned
    expect(stringWidth(sentence)).toBe(38);
  });

  it('does not count a combining accent, which used to inflate the width', () => {
    expect(stringWidth('é')).toBe(1);
    expect('é'.length).toBe(2); // the old definition said 2
  });

  it('counts an astral glyph once, not twice', () => {
    expect(stringWidth('\u{1F680}')).toBe(2);
    expect('\u{1F680}'.length).toBe(2); // coincidentally right, for the wrong reason
    expect(stringWidth('\u{1F600}x')).toBe(3);
  });
});

describe('clampBox keeps a line inside the box in real columns', () => {
  it('does not emit 59 columns for a box of 40', () => {
    // The measured failure: visibleWidth said 40 while the terminal drew 59,
    // produced by the very function meant to prevent the overhang.
    const [line] = clampBox(['测'.repeat(19)], 40, 1);
    expect(stringWidth(line.replace(/\x1b\[[0-9;]*m/g, ''))).toBeLessThanOrEqual(40);
  });

  it('does not draw the border short when combining marks are present', () => {
    const [line] = clampBox(['é'.repeat(20)], 40, 1);
    expect(visibleWidth(line)).toBe(40);
  });

  it('control: a plain ASCII line is still exactly the box width', () => {
    const [line] = clampBox(['hallo'], 40, 1);
    expect(visibleWidth(line)).toBe(40);
    expect(line.startsWith('hallo')).toBe(true);
  });
});

describe('wrapAnsi wraps at real columns', () => {
  it('keeps every wrapped line within the limit', () => {
    for (const line of wrapAnsi('你好世界 '.repeat(6), 20)) {
      expect(stringWidth(line.replace(/\x1b\[[0-9;]*m/g, ''))).toBeLessThanOrEqual(20);
    }
  });

  it('never splits a wide glyph across the right edge', () => {
    // Half a glyph would be drawn and the terminal would wrap the other half.
    for (const line of wrapAnsi('a你好世界', 4)) {
      expect(stringWidth(line.replace(/\x1b\[[0-9;]*m/g, ''))).toBeLessThanOrEqual(4);
    }
  });
});

describe('the differential renderer addresses the physical column', () => {
  function frameFor(before: string, after: string): string {
    const frames: string[] = [];
    const term = { columns: 40, rows: 1, write: (f: string) => { frames.push(f); } } as unknown as TuiTerminalWriter;
    const renderer = new TuiDifferentialRenderer();
    renderer.render(term, [before]);
    renderer.render(term, [after]);
    return frames[1];
  }

  it('lands after the wide glyphs, not inside them', () => {
    // Four CJK glyphs occupy columns 1-8, the space is 9, "abc" is 10-12.
    // Changing the last character must address column 12. The old cell-index
    // addressing produced column 8, in the middle of a glyph.
    const frame = frameFor('你好世界 abc', '你好世界 abd');
    expect(frame).toContain('\x1b[1;12H');
    expect(frame).not.toContain('\x1b[1;8H');
  });

  it('does not split a wide glyph across the last column', () => {
    // The layout path has its own edge guard; this one exercises tokenizeLine,
    // which is a separate call site. Cutting the guard there stayed green until
    // this case existed.
    const frames: string[] = [];
    const term = { columns: 5, rows: 1, write: (f: string) => { frames.push(f); } } as unknown as TuiTerminalWriter;
    // Columns 1-4 are taken by "abcd", so the wide glyph would need 5 and 6.
    new TuiDifferentialRenderer().render(term, ['abcd你']);
    // The strip must cover private-mode sequences too: ESC [ ? 2 5 l has a
    // '?' that a [0-9;]* class does not match, and the leftover counts as text.
    const painted = frames[0].replace(/\x1b\[[?0-9;]*[A-Za-z]/g, '');
    expect(painted).not.toContain('你');
    expect(stringWidth(painted)).toBeLessThanOrEqual(5);
  });

  it('control: the same glyph fits when there is room for both its columns', () => {
    // Without this, refusing to draw wide glyphs at all would pass the case
    // above while being a much worse bug.
    const frames: string[] = [];
    const term = { columns: 6, rows: 1, write: (f: string) => { frames.push(f); } } as unknown as TuiTerminalWriter;
    new TuiDifferentialRenderer().render(term, ['abcd你']);
    expect(frames[0]).toContain('你');
  });

  it('control: with ASCII only, index and column agree and nothing changed', () => {
    // Without this the assertion above could pass on an off-by-something that
    // happens to be right for wide glyphs and wrong for everything else.
    const frame = frameFor('abcdefghijkl', 'abcdefghijkm');
    expect(frame).toContain('\x1b[1;12H');
  });
});
