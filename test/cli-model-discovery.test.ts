import { describe, expect, it } from 'vitest';
import { EFFORT_REJECTED, parseAgyModels } from '../src/providers/cli-gemini.js';
import { parseGrokModels } from '../src/providers/grok-cli.js';
import { parseCodexModels } from '../src/providers/cli-codex.js';
import { belongsToProvider, noteForeignVendors } from '../src/model-catalog.js';

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
// Captured verbatim from `grok models` — prose, then a bullet list, not a table.
const GROK_MODELS_STDOUT = [
  'You are logged in with grok.com.',
  '',
  'Default model: grok-4.6',
  '',
  'Available models:',
  '  * grok-4.6 (default)',
  '  - grok-4.5',
].join('\n');

describe('parseGrokModels', () => {
  it('reads the bullet list under the Available models header', () => {
    expect(parseGrokModels(GROK_MODELS_STDOUT)).toEqual(['grok-4.6', 'grok-4.5']);
  });

  it('does not mistake the "Default model:" line for a catalog entry', () => {
    expect(parseGrokModels(GROK_MODELS_STDOUT)).not.toContain('Default');
    expect(parseGrokModels('Default model: grok-4.6')).toEqual([]);
  });

  // The staleness this replaces: the hardcoded list advertised grok-4.3, which
  // `grok models` no longer reports, so the bridge offered a dead id to VS Code.
  it('omits ids grok no longer serves', () => {
    expect(parseGrokModels(GROK_MODELS_STDOUT)).not.toContain('grok-4.3');
  });

  it('returns nothing for prose, an error, or empty output', () => {
    expect(parseGrokModels('')).toEqual([]);
    expect(parseGrokModels('Error: not logged in. Run `grok login`.')).toEqual([]);
    expect(parseGrokModels('You are logged in with grok.com.')).toEqual([]);
  });

  it('rejects a pathological id without catastrophic backtracking', () => {
    const evil = 'Available models:\n  * a-' + '.'.repeat(44) + '!';
    const started = Date.now();
    expect(parseGrokModels(evil)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

// Captured verbatim from https://chatgpt.com/backend-api/codex/models
// (`client_version` is required; the endpoint 400s without it).
const CODEX_MODELS_BODY = {
  models: [
    { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', visibility: 'list' },
    { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', visibility: 'list' },
    { slug: 'gpt-daybreak-blue-latest', display_name: 'Daybreak Blue', visibility: 'list' },
    { slug: 'gpt-reserve', display_name: 'GPT-Reserve', visibility: 'hide' },
    { slug: 'gpt-5.4-mini', display_name: 'GPT-5.4-Mini', visibility: 'list' },
    { slug: 'codex-auto-review', display_name: 'Codex Auto Review', visibility: 'hide' },
  ],
};

describe('parseCodexModels', () => {
  it('reads the account entitlements the endpoint reports', () => {
    expect(parseCodexModels(CODEX_MODELS_BODY).map(m => m.id)).toEqual([
      'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-daybreak-blue-latest', 'gpt-5.4-mini',
    ]);
  });

  it('drops the models the endpoint marks visibility:hide', () => {
    const ids = parseCodexModels(CODEX_MODELS_BODY).map(m => m.id);
    expect(ids).not.toContain('gpt-reserve');
    expect(ids).not.toContain('codex-auto-review');
  });

  it('keeps the display names the endpoint supplies', () => {
    expect(parseCodexModels(CODEX_MODELS_BODY)[0])
      .toEqual({ id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol' });
  });

  it('returns nothing for an error body or an unexpected shape', () => {
    expect(parseCodexModels({ error: { message: 'nope' } })).toEqual([]);
    expect(parseCodexModels(null)).toEqual([]);
    expect(parseCodexModels({ models: 'not-an-array' })).toEqual([]);
  });
});

// A prefix names a transport, not a vendor. agy resells Anthropic and GPT-OSS
// models, and those are reachable through the Antigravity subscription — a real
// capability. Ids stay unique because the prefixes differ, so nothing collides.
describe('provider namespaces', () => {
  it('cli-gemini advertises everything agy serves, including resold models', () => {
    const ids = noteForeignVendors('cli-gemini', parseAgyModels(AGY_MODELS_STDOUT)).map(m => m.id);
    expect(ids).toHaveLength(11);
    expect(ids).toContain('gemini-3.7-flash-high');
    expect(ids).toContain('claude-sonnet-4-6');
    expect(ids).toContain('claude-opus-4-6-thinking');
    expect(ids).toContain('gpt-oss-120b-medium');
  });

  // The regression this replaces: dropping the resold ids removed them from the
  // picker while ownsModel kept routing them, so the capability was invisible
  // rather than absent.
  it('never drops an id — noting a foreign vendor is not filtering it', () => {
    const entries = [{ id: 'gemini-3.1-pro-low' }, { id: 'claude-sonnet-4-6' }];
    expect(noteForeignVendors('cli-gemini', entries)).toEqual(entries);
    expect(noteForeignVendors('cli-claude', entries)).toEqual(entries);
  });

  it('prefixed ids stay distinct across providers', () => {
    // The two routes to Claude Sonnet 4.6 are different strings, and each
    // resolves to its own provider class.
    expect(`cli-gemini/claude-sonnet-4-6`).not.toBe(`cli-claude/claude-sonnet-4-6`);
    expect(belongsToProvider('cli-claude', 'claude-sonnet-4-6')).toBe(true);
    expect(belongsToProvider('cli-gemini', 'claude-sonnet-4-6')).toBe(false);
  });

  it('assigns each vendor family to exactly one provider', () => {
    const cases: Array<[Parameters<typeof belongsToProvider>[0], string, boolean]> = [
      ['cli-claude', 'claude-opus-5', true],
      ['cli-claude', 'gpt-5.6-sol', false],
      ['cli-codex', 'gpt-5.6-sol', true],
      ['cli-codex', 'codex-auto-review', true],
      ['cli-codex', 'claude-sonnet-4-6', false],
      ['cli-gemini', 'gemini-3.8-flash-high', true],
      ['cli-gemini', 'gpt-oss-120b-medium', false],
      ['cli-grok', 'grok-4.6', true],
      ['cli-grok', 'gemini-3.1-pro-low', false],
    ];
    for (const [provider, id, expected] of cases) {
      expect(belongsToProvider(provider, id), `${provider} / ${id}`).toBe(expected);
    }
  });
});

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
