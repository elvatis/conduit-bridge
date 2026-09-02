import { describe, expect, it } from 'vitest';
import { parseAgyModels } from '../src/providers/cli-gemini.js';

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
});
