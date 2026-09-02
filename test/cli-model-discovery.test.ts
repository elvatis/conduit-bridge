import { describe, expect, it } from 'vitest';
import { EFFORT_REJECTED, parseAgyModels } from '../src/providers/cli-gemini.js';

// Captured verbatim from `agy models` (tab-separated, with the status preamble).
const AGY_MODELS_STDOUT = [
  'Fetching available models...',
  'gemini-3.7-flash-high\tGemini 3.7 Flash (High)',
  'gemini-3.7-flash-medium\tGemini 3.7 Flash (Medium)',
  'gemini-3.7-flash-low\tGemini 3.7 Flash (Low)',
  'gemini-3.6-flash-high\tGemini 3.6 Flash (High)',
  'gemini-3.6-flash-medium\tGemini 3.6 Flash (Medium)',
  'gemini-3.6-flash-low\tGemini 3.6 Flash (Low)',
  'gemini-3.1-pro-high\tGemini 3.1 Pro (High)',
  'gemini-3.1-pro-low\tGemini 3.1 Pro (Low)',
  'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
  'claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)',
  'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
].join('\n');

describe('parseAgyModels', () => {
  it('reads every model agy reports, id and display name', () => {
    const models = parseAgyModels(AGY_MODELS_STDOUT);
    expect(models).toHaveLength(11);
    expect(models[0]).toEqual({
      id: 'gemini-3.7-flash-high',
      displayName: 'Gemini 3.7 Flash (High)',
    });
    expect(models.map(m => m.id)).toContain('gpt-oss-120b-medium');
  });

  it('drops the "Fetching available models..." preamble', () => {
    const ids = parseAgyModels(AGY_MODELS_STDOUT).map(m => m.id);
    expect(ids).not.toContain('Fetching');
    expect(ids.some(id => /fetching/i.test(id))).toBe(false);
  });

  // The staleness this replaces: the hardcoded catalog advertised a 3.5 family
  // agy rejects outright, and never listed the 3.7 family agy actually serves.
  it('surfaces newly released ids and omits retired ones', () => {
    const ids = parseAgyModels(AGY_MODELS_STDOUT).map(m => m.id);
    expect(ids).toContain('gemini-3.7-flash-high');
    expect(ids.some(id => id.startsWith('gemini-3.5-'))).toBe(false);
  });

  it('accepts space-aligned output as well as tabs', () => {
    const models = parseAgyModels('gemini-3.1-pro-low      Gemini 3.1 Pro (Low)');
    expect(models).toEqual([
      { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)' },
    ]);
  });

  it('returns nothing for prose, empty output, or an error message', () => {
    expect(parseAgyModels('')).toEqual([]);
    expect(parseAgyModels('Fetching available models...')).toEqual([]);
    expect(parseAgyModels('Error: not authenticated. Run agy login.')).toEqual([]);
  });

  it('ignores duplicate ids', () => {
    const dup = 'gemini-3.1-pro-low\tA\ngemini-3.1-pro-low\tB';
    expect(parseAgyModels(dup)).toHaveLength(1);
  });

  // The id validator once put `.` in BOTH its segment class and its separator
  // class, making the two quantifiers ambiguous. On a non-matching id — "a-",
  // many dots, then a character no branch accepts — that backtracks
  // exponentially: measured 11ms at 30 dots and >1.5s at 40 on the old pattern,
  // roughly x7 per additional 4 dots. Parsing runs on whatever the CLI prints,
  // so it has to stay linear.
  it('rejects a pathological id without catastrophic backtracking', () => {
    const evil = 'a-' + '.'.repeat(44) + '!\tDisplay Name';
    const started = Date.now();
    expect(parseAgyModels(evil)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

// Discovery makes ids selectable that no shape heuristic anticipated: agy also
// serves Anthropic and GPT-OSS models, and it refuses --effort for them with a
// different message than the tier conflict. Both exit 1 with empty stdout.
describe('EFFORT_REJECTED', () => {
  it('matches both of agy’s refusals, verbatim from the binary', () => {
    expect(EFFORT_REJECTED.test(
      'Error: invalid model selection (--model "claude-sonnet-4-6" --effort "medium"): ' +
      '--effort is not supported for model "claude-sonnet-4-6"',
    )).toBe(true);
    expect(EFFORT_REJECTED.test(
      'Error: invalid model selection (--model "gemini-3.6-flash-low" --effort "high"): ' +
      '--model gemini-3.6-flash-low conflicts with --effort=high',
    )).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    expect(EFFORT_REJECTED.test('Error: not authenticated. Run agy login.')).toBe(false);
    expect(EFFORT_REJECTED.test('model gemini-3.5-flash-high is not recognized')).toBe(false);
    expect(EFFORT_REJECTED.test('')).toBe(false);
  });
});
