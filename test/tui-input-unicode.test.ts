import { describe, expect, it } from 'vitest';
import { decodeKey, isPrintableCodePoint } from '../src/tui-render.js';

/**
 * Input outside ASCII used to be consumed and thrown away without any signal:
 * decodeKey returned undefined, and the caller had already advanced the buffer.
 * For a German-speaking user that made the composer unusable in their own
 * language, and nothing on screen said why.
 */

/** What survives if every code point is fed through decodeKey one at a time. */
function typed(text: string): string {
  let out = '';
  for (const point of text) {
    const key = decodeKey(point);
    if (key?.type === 'char') out += key.value;
  }
  return out;
}

describe('decodeKey accepts every printable code point', () => {
  it('keeps German text intact', () => {
    const sentence = 'Erklaere mir die Groesse der Datei strasse';
    expect(typed(sentence)).toBe(sentence);
  });

  it('keeps umlauts and sharp s, the case that was measurably destroyed', () => {
    expect(typed('äöüÄÖÜß')).toBe('äöüÄÖÜß');
  });

  it('keeps accented Latin, Cyrillic and CJK', () => {
    expect(typed('café')).toBe('café');
    expect(typed('привет')).toBe('привет');
    expect(typed('你好')).toBe('你好');
  });

  it('keeps an astral code point, which arrives as a surrogate pair', () => {
    const rocket = '\u{1F680}';
    expect([...rocket]).toHaveLength(1);
    expect(rocket.length).toBe(2); // two UTF-16 code units, one code point
    expect(typed(rocket)).toBe(rocket);
  });

  it('control: ASCII still works, so the fix did not trade one range for another', () => {
    const ascii = 'plain ASCII stays 123 !?';
    expect(typed(ascii)).toBe(ascii);
  });

  it('control: control characters are still refused', () => {
    // If this passed, the filter would be accepting everything and the
    // assertions above would prove nothing.
    expect(isPrintableCodePoint('\x00')).toBe(false);
    expect(isPrintableCodePoint('\x1b')).toBe(false);
    expect(isPrintableCodePoint('\x7f')).toBe(false);
    expect(isPrintableCodePoint('')).toBe(false);
  });

  it('control: a lone surrogate is refused rather than corrupting the buffer', () => {
    expect(isPrintableCodePoint('\ud83d')).toBe(false);
  });

  it('control: two code points at once are refused', () => {
    expect(isPrintableCodePoint('ab')).toBe(false);
  });

  it('does not swallow keys that carry meaning', () => {
    expect(decodeKey('\r')).not.toEqual({ type: 'char', value: '\r' });
    expect(decodeKey('\x03')).toEqual({ type: 'ctrl', key: 'c' });
  });
});
