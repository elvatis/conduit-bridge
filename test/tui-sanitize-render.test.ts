import { describe, expect, it } from 'vitest';
import { TuiDifferentialRenderer, type TuiTerminalWriter } from '../src/tui-render.js';

/**
 * The differential renderer is the SECOND place a string becomes cells, and it
 * is the one that actually writes to the terminal. renderTuiLines does not
 * reach it: that path tokenises in tui-layout.ts.
 *
 * This file exists because the first version of these tests covered only the
 * layout path. Cutting the sanitiser call in tui-render.ts left every test
 * green, which made the guard on that call site worth nothing. The cut is the
 * only reason that was noticed.
 */

function captureFrames(): { term: TuiTerminalWriter; frames: string[] } {
  const frames: string[] = [];
  return {
    frames,
    term: {
      columns: 40,
      rows: 3,
      write: (frame: string) => { frames.push(frame); },
    } as unknown as TuiTerminalWriter,
  };
}

/**
 * Escapes the renderer emits itself, which must not be confused with leaked
 * ones. This list is deliberately explicit rather than a catch-all for private
 * modes: when the renderer gained Synchronized Output these assertions went
 * red, which is the behaviour wanted. A new escape in a frame should have to be
 * declared here, because the whole point is noticing escapes nobody declared.
 */
const RENDERER_OWN = /\x1b\[\?2026[lh]|\x1b\[\?25[lh]|\x1b\[\d+;\d+H|\x1b\[[0-9;]*m/g;

function leakedControlBytes(frame: string): string[] {
  const rest = frame.replace(RENDERER_OWN, '');
  return [...rest].filter(ch => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}

describe('the differential renderer never replays a control byte from content', () => {
  it('drops a clear-screen sequence that arrived inside a line', () => {
    const { term, frames } = captureFrames();
    new TuiDifferentialRenderer().render(term, ['vor\x1b[2Jnach', '', '']);
    expect(frames).toHaveLength(1);
    expect(frames[0]).not.toContain('\x1b[2J');
    expect(leakedControlBytes(frames[0])).toEqual([]);
    // The visible text must survive; dropping the whole line would also pass
    // the assertions above while being a different bug.
    expect(frames[0]).toContain('vornach');
  });

  it('drops an alternate-screen switch and a full reset', () => {
    const { term, frames } = captureFrames();
    new TuiDifferentialRenderer().render(term, ['a\x1b[?1049lb\x1bcc', '', '']);
    expect(frames[0]).not.toContain('\x1b[?1049l');
    expect(leakedControlBytes(frames[0])).toEqual([]);
    expect(frames[0]).toContain('abc');
  });

  it('drops BEL and DEL', () => {
    const { term, frames } = captureFrames();
    new TuiDifferentialRenderer().render(term, ['x\x07y\x7fz', '', '']);
    expect(leakedControlBytes(frames[0])).toEqual([]);
    expect(frames[0]).toContain('xyz');
  });

  it('still carries colour through, since SGR is kept on purpose', () => {
    const { term, frames } = captureFrames();
    new TuiDifferentialRenderer().render(term, ['\x1b[31mrot\x1b[0m', '', '']);
    expect(frames[0]).toContain('\x1b[31m');
    expect(leakedControlBytes(frames[0])).toEqual([]);
  });

  it('control: an ordinary line yields a frame whose only escapes are the renderer own', () => {
    // Without this the assertions above could hold on an empty frame.
    const { term, frames } = captureFrames();
    new TuiDifferentialRenderer().render(term, ['ganz gewoehnlich', '', '']);
    expect(leakedControlBytes(frames[0])).toEqual([]);
    expect(frames[0]).toContain('ganz gewoehnlich');
    expect(frames[0]).toMatch(/\x1b\[\?25l/);
  });
});
