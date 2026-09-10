import { describe, expect, it } from 'vitest';
import {
  clampBox,
  fitLine,
  layoutProfile,
  middleTruncate,
  sliceTranscript,
  stripAnsi,
  tooSmallMessage,
  tooSmallOverlay,
  visibleWidth,
  wrapAnsi,
} from '../src/tui-layout.js';

describe('wrapAnsi', () => {
  it('breaks only on spaces, never in the middle of a word', () => {
    const lines = wrapAnsi('hello world from conduit', 10);
    expect(lines).toEqual(['hello', 'world from', 'conduit']);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(10);
  });

  it('treats hyphen as a legal break after the dash', () => {
    expect(wrapAnsi('well-known issue', 8)).toEqual(['well-', 'known', 'issue']);
  });

  it('carries ANSI color onto the next wrapped line', () => {
    const lines = wrapAnsi('\x1b[31mhello world\x1b[0m', 6);
    expect(stripAnsi(lines[0])).toBe('hello');
    expect(stripAnsi(lines[1])).toBe('world');
    expect(lines[0]).toContain('\x1b[31m');
    expect(lines[1]).toContain('\x1b[31m');
    expect(lines[0]).toContain('\x1b[0m');
    expect(lines[1]).toContain('\x1b[0m');
  });

  it('middle-truncates an unsplittable token that exceeds the box', () => {
    const line = wrapAnsi('supercalifragilistic', 8);
    expect(line).toHaveLength(1);
    expect(visibleWidth(line[0])).toBe(8);
    expect(line[0]).toContain('...');
    expect(line[0].startsWith('supe') || line[0].startsWith('super')).toBe(true);
  });

  it('keeps the rest of the paragraph after truncating an unsplittable token', () => {
    const lines = wrapAnsi('see supercalifragilistic now', 8);
    const plain = lines.map(stripAnsi);
    expect(plain.some(line => line.includes('see'))).toBe(true);
    expect(plain.some(line => line.includes('now'))).toBe(true);
    expect(plain.some(line => line.includes('...'))).toBe(true);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(8);
  });

  it('does not count ANSI sequences toward wrap width', () => {
    const lines = wrapAnsi('\x1b[32malpha beta gamma\x1b[0m', 6);
    expect(lines.map(stripAnsi)).toEqual(['alpha', 'beta', 'gamma']);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(6);
  });
});

describe('middleTruncate', () => {
  it('keeps the filename when truncating a path', () => {
    const value = middleTruncate('src/modules/runtime/orchestrator.ts', 24);
    expect(visibleWidth(value)).toBeLessThanOrEqual(24);
    expect(value).toContain('...');
    expect(value).toContain('orchestrator.ts');
    expect(value.startsWith('src')).toBe(true);
  });

  it('does not grow past the requested width with ANSI prefixes', () => {
    const value = middleTruncate('\x1b[36msrc/really/deep/nested/file.ts\x1b[0m', 16);
    expect(visibleWidth(value)).toBeLessThanOrEqual(16);
    expect(value).toContain('\x1b[36m');
  });
});

describe('fitLine and clampBox', () => {
  it('pads or truncates a single line to the box width', () => {
    expect(visibleWidth(fitLine('ok', 6))).toBe(6);
    expect(visibleWidth(fitLine('this-is-too-long-for-the-box', 10))).toBe(10);
  });

  it('clips a region to width and height without leaking into neighbors', () => {
    const boxed = clampBox(['alpha', 'beta overflow text', 'gamma'], 8, 2);
    expect(boxed).toHaveLength(2);
    for (const line of boxed) expect(visibleWidth(line)).toBe(8);
  });
});

describe('layoutProfile', () => {
  it('selects large, medium, small and tiny breakpoints', () => {
    expect(layoutProfile(140, 40).mode).toBe('large');
    expect(layoutProfile(140, 40).sidebar).toBeGreaterThanOrEqual(25);
    expect(layoutProfile(90, 30).mode).toBe('medium');
    expect(layoutProfile(90, 30).sidebar).toBe(20);
    expect(layoutProfile(70, 24).mode).toBe('small');
    expect(layoutProfile(70, 24).sidebar).toBe(0);
    expect(layoutProfile(50, 20).tooSmall).toBe(true);
    expect(layoutProfile(80, 14).tooSmall).toBe(true);
    expect(layoutProfile(80, 20).headerRows).toBe(1);
    expect(layoutProfile(80, 30).headerRows).toBe(2);
  });
});

describe('tooSmallMessage and transcript slice', () => {
  it('names the current size in the fallback overlay', () => {
    expect(tooSmallMessage(40, 10)).toBe('Terminal window too small: 40x10. Please resize to at least 60x15.');
    const overlay = tooSmallOverlay(40, 10);
    expect(overlay).toHaveLength(10);
    expect(overlay.map(stripAnsi).join(' ').replace(/\s+/g, ' ')).toContain('Terminal window too small: 40x10. Please resize to at least 60x15.');
    for (const line of overlay) expect(visibleWidth(line)).toBe(40);
  });

  it('sticks to the bottom unless a scroll offset is applied', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    expect(sliceTranscript(lines, 3, 0).view).toEqual(['c', 'd', 'e']);
    expect(sliceTranscript(lines, 3, 2).view).toEqual(['a', 'b', 'c']);
    expect(sliceTranscript(lines, 3, 99).offset).toBe(2);
  });
});
