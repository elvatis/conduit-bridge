import { describe, expect, it } from 'vitest';
import { sanitizeCellText, TAB_WIDTH } from '../src/tui-sanitize.js';
import { renderTuiLines, type TuiState } from '../src/tui-render.js';

/**
 * The invariant under test: a rendered frame never carries a control byte that
 * the terminal would act on.
 *
 * These assertions are written against the FRAME, not against the sanitiser,
 * because the sanitiser being correct is worth nothing if a tokeniser stops
 * calling it. Reverting either call site in tui-render.ts or tui-layout.ts
 * turns the frame-level cases red.
 */

/** Mirrors the fixture in interactive-cli.test.ts so the frame is realistic. */
function baseState(content: string): TuiState {
  return {
    view: 'chat', overlay: 'none', model: 'cli-codex/first',
    sessionId: 'session-1', sessionTitle: 'CLI chat',
    messages: [{ role: 'assistant', content, model: 'cli-codex/first' }],
    input: '', cursor: 0, filter: '', selected: 0,
    models: [{ id: 'cli-codex/first' }],
    sessions: [{ id: 'session-1', title: 'CLI chat', model: 'cli-codex/first', updatedAt: 1 }],
    runs: [], workspaces: [],
    git: { detected: true, branch: 'main', files: 3, name: 'conduit-bridge' },
    host: '127.0.0.1:31338', notice: '',
    busy: false, streaming: '', width: 120, height: 40,
  } as unknown as TuiState;
}

const frameOf = (content: string): string =>
  renderTuiLines(baseState(content)).lines.join(String.fromCharCode(10));

describe('sanitizeCellText', () => {
  it('keeps SGR, because colour is what the renderer runs on', () => {
    expect(sanitizeCellText('\x1b[31mrot\x1b[0m')).toBe('\x1b[31mrot\x1b[0m');
  });

  it('drops a screen-clearing CSI whole, tail included', () => {
    // Leaving "[2J" behind as literal text would be a quieter bug, not a fix.
    expect(sanitizeCellText('vor\x1b[2Jnach')).toBe('vornach');
  });

  it('drops cursor movement, buffer switches and full reset', () => {
    expect(sanitizeCellText('a\x1b[10;20Hb')).toBe('ab');
    expect(sanitizeCellText('a\x1b[?1049hb')).toBe('ab');
    expect(sanitizeCellText('a\x1bcb')).toBe('ab');
  });

  it('drops an OSC sequence terminated either way', () => {
    expect(sanitizeCellText('a\x1b]0;title\x07b')).toBe('ab');
    expect(sanitizeCellText('a\x1b]0;title\x1b\\b')).toBe('ab');
  });

  it('drops an unterminated escape rather than emitting its remainder', () => {
    expect(sanitizeCellText('a\x1b[999')).toBe('a');
    expect(sanitizeCellText('a\x1b')).toBe('a');
  });

  it('drops BEL, CR and DEL', () => {
    expect(sanitizeCellText('a\x07b\rc\x7fd')).toBe('abcd');
  });

  it('expands tabs so indentation survives instead of collapsing', () => {
    expect(sanitizeCellText('\tx')).toBe(`${' '.repeat(TAB_WIDTH)}x`);
  });

  it('leaves ordinary text untouched, including non-ASCII', () => {
    // Control: the filter must not be the thing that eats umlauts.
    expect(sanitizeCellText('Gruesse aus Muenchen: aeoeue')).toBe('Gruesse aus Muenchen: aeoeue');
    expect(sanitizeCellText('你好')).toBe('你好');
  });
});

describe('a frame never carries an actionable control byte', () => {
  it('does not replay a clear-screen sequence that arrived in model output', () => {
    const frame = frameOf('hier kommt \x1b[2J\x1b[H der Angriff');
    expect(frame).not.toContain('\x1b[2J');
    expect(frame).not.toContain('\x1b[H');
  });

  it('does not replay BEL from model output', () => {
    expect(frameOf('ping\x07ping')).not.toContain('\x07');
  });

  it('does not replay an alternate-screen switch from model output', () => {
    const frame = frameOf('\x1b[?1049l raus hier');
    expect(frame).not.toContain('\x1b[?1049l');
  });

  it('control: a harmless reply produces a frame with none of those bytes', () => {
    // Without this the assertions above could pass on an empty frame and prove
    // nothing at all.
    const frame = frameOf('eine voellig gewoehnliche Antwort');
    expect(frame).not.toContain('\x1b[2J');
    expect(frame.length).toBeGreaterThan(100);
    expect(frame).toContain('gewoehnliche');
  });
});
