import { describe, expect, it } from 'vitest';
import { applyTuiKey, normalizePaste, type TuiState } from '../src/tui-render.js';
import { TuiDifferentialRenderer, type TuiTerminalWriter } from '../src/tui-render.js';

/**
 * Two frame-level guarantees that were missing once full repaints were gone:
 * a pasted block is one insertion rather than a key sequence, and a frame is
 * presented as one unit rather than as the bytes happen to arrive.
 */

const composer = (input = '', cursor = input.length): TuiState =>
  ({ view: 'chat', overlay: 'none', input, cursor, messages: [], busy: false, streaming: '' }) as unknown as TuiState;

describe('normalizePaste', () => {
  it('turns line breaks into single spaces, keeping every word', () => {
    expect(normalizePaste('erste\nzweite\ndritte')).toBe('erste zweite dritte');
  });

  it('handles CRLF, which is what a Windows clipboard delivers', () => {
    expect(normalizePaste('a\r\nb')).toBe('a b');
  });

  it('collapses the run of whitespace a blank line would leave behind', () => {
    expect(normalizePaste('a\n\n\nb')).toBe('a b');
  });

  it('control: text without line breaks is untouched', () => {
    expect(normalizePaste('nur eine Zeile')).toBe('nur eine Zeile');
  });
});

describe('a pasted block never sends', () => {
  it('inserts three lines as one prompt instead of firing two sends', () => {
    // The reported failure: a three-line paste produced two sends and left the
    // third line in the composer, because each newline arrived as `enter`.
    const { state, action } = applyTuiKey(composer(), { type: 'paste', value: 'erste\nzweite\ndritte' });
    expect(action).toBe('none');
    expect(state.input).toBe('erste zweite dritte');
  });

  it('inserts at the cursor, not at the end', () => {
    const { state } = applyTuiKey(composer('ab', 1), { type: 'paste', value: 'X' });
    expect(state.input).toBe('aXb');
    expect(state.cursor).toBe(2);
  });

  it('control: a real enter still sends, so the fix did not disable sending', () => {
    // Without this, making paste harmless by disabling enter would pass above.
    const { action } = applyTuiKey(composer('hallo'), { type: 'enter' });
    expect(action).not.toBe('none');
  });
});

describe('a frame is presented as one unit', () => {
  function frame(): string {
    const frames: string[] = [];
    const term = { columns: 20, rows: 2, write: (f: string) => { frames.push(f); } } as unknown as TuiTerminalWriter;
    new TuiDifferentialRenderer().render(term, ['hallo', 'welt'], { row: 1, col: 1 });
    return frames[0];
  }

  it('opens with begin synchronized update and closes with end', () => {
    const painted = frame();
    expect(painted.startsWith('\x1b[?2026h')).toBe(true);
    expect(painted.endsWith('\x1b[?2026l')).toBe(true);
  });

  it('closes AFTER the cursor is placed, or the move shows on its own', () => {
    const painted = frame();
    const cursorAt = painted.lastIndexOf('\x1b[1;1H');
    const endAt = painted.lastIndexOf('\x1b[?2026l');
    expect(cursorAt).toBeGreaterThan(-1);
    expect(endAt).toBeGreaterThan(cursorAt);
  });

  it('control: the frame still carries its content and cursor handling', () => {
    // Without this the assertions above would hold for a frame of nothing but
    // the two synchronisation markers.
    const painted = frame();
    expect(painted).toContain('hallo');
    expect(painted).toContain('\x1b[?25l');
  });
});
