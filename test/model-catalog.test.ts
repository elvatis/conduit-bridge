import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  catalogFilePath,
  catalogFor,
  isModelId,
  isPinned,
  parseCatalogEntries,
  parseCatalogFile,
  reloadCatalogs,
  SERVED_BY,
} from '../src/model-catalog.js';
import { GeminiCliProvider } from '../src/providers/cli-gemini.js';

describe('parseCatalogEntries', () => {
  it('accepts plain id strings and {id, displayName} objects', () => {
    expect(parseCatalogEntries(['claude-opus-5', { id: 'gpt-5.6-sol', displayName: 'Sol' }]))
      .toEqual([{ id: 'claude-opus-5' }, { id: 'gpt-5.6-sol', displayName: 'Sol' }]);
  });

  it('drops junk rather than letting it reach /v1/models', () => {
    expect(parseCatalogEntries([
      'Not A Model', '', 42, null, { }, { id: 'has space' }, { id: 'UPPER' },
    ])).toEqual([]);
  });

  it('de-duplicates ids', () => {
    expect(parseCatalogEntries(['grok-4.6', 'grok-4.6'])).toEqual([{ id: 'grok-4.6' }]);
  });

  it('is not an array — returns nothing', () => {
    expect(parseCatalogEntries({ id: 'grok-4.6' })).toEqual([]);
    expect(parseCatalogEntries('grok-4.6')).toEqual([]);
  });
});

describe('isModelId', () => {
  it('matches the ids the CLIs actually serve', () => {
    for (const id of [
      'claude-opus-5', 'gpt-5.6-sol', 'gemini-3.8-flash-high',
      'claude-opus-4-6-thinking', 'gpt-oss-120b-medium', 'grok-4.6',
    ]) expect(isModelId(id), id).toBe(true);
  });

  it('rejects prose, paths and traversal', () => {
    for (const bad of ['Fetching', 'a b', '../etc/passwd', '-leading', 'x'.repeat(200), 5])
      expect(isModelId(bad), String(bad)).toBe(false);
  });

  // Same class of bug as the agy parser: overlapping separator and segment
  // classes backtrack exponentially. Keep it linear.
  it('stays linear on a pathological id', () => {
    const started = Date.now();
    expect(isModelId('a-' + '.'.repeat(44) + '!')).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

// owned_by names the CLI that answers, not a guess at the model's author.
// Deriving the author from the id prefix conflates "who built it" with "where
// you can get it": gpt-oss-120b is OpenAI's open-weight model, is served here by
// agy, and is not obtainable from OpenAI — labelling it `openai` would advertise
// a route that does not exist.
describe('SERVED_BY', () => {
  it('names the transport for every CLI provider', () => {
    expect(SERVED_BY).toEqual({
      'cli-claude': 'claude-code',
      'cli-codex': 'codex',
      'cli-gemini': 'agy',
      'cli-grok': 'grok',
    });
  });

  it('does not vary with the model, so a resold id cannot imply a wrong route', () => {
    // Both of these are served by agy, whatever their id suggests.
    expect(SERVED_BY['cli-gemini']).toBe('agy');
    expect(SERVED_BY['cli-gemini']).not.toBe('openai');
    expect(SERVED_BY['cli-gemini']).not.toBe('anthropic');
  });
});

describe('parseCatalogFile', () => {
  it('reads known providers and ignores unknown keys', () => {
    expect(parseCatalogFile({
      'cli-claude': ['claude-opus-5'],
      'not-a-provider': ['whatever'],
    })).toEqual({ 'cli-claude': [{ id: 'claude-opus-5' }] });
  });

  it('ignores a provider whose list has nothing usable', () => {
    // An empty list is a mistake, not an instruction to advertise nothing.
    expect(parseCatalogFile({ 'cli-codex': [] })).toEqual({});
    expect(parseCatalogFile({ 'cli-codex': ['NOT VALID'] })).toEqual({});
  });

  it('survives a non-object top level', () => {
    for (const bad of [null, [], 'x', 7]) expect(parseCatalogFile(bad)).toEqual({});
  });
});

describe('catalogFor with a models.json override', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'conduit-catalog-test-'));
    process.env.CONDUIT_MODELS_FILE = join(dir, 'models.json');
    reloadCatalogs();
  });

  afterEach(() => {
    delete process.env.CONDUIT_MODELS_FILE;
    reloadCatalogs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to the shipped defaults when there is no file', () => {
    expect(catalogFor('cli-claude').map(m => m.id)).toContain('claude-opus-5');
    expect(isPinned('cli-claude')).toBe(false);
  });

  it('honours the file path from CONDUIT_MODELS_FILE', () => {
    expect(catalogFilePath()).toBe(join(dir, 'models.json'));
  });

  // The point of the whole module: a new model release should need an edited
  // file, not a new build of the bridge.
  it('serves a model added to the file without any code change', () => {
    writeFileSync(process.env.CONDUIT_MODELS_FILE!, JSON.stringify({
      'cli-claude': ['claude-opus-6', { id: 'claude-sonnet-6', displayName: 'Sonnet 6' }],
    }));
    reloadCatalogs();
    expect(catalogFor('cli-claude')).toEqual([
      { id: 'claude-opus-6' },
      { id: 'claude-sonnet-6', displayName: 'Sonnet 6' },
    ]);
    expect(isPinned('cli-claude')).toBe(true);
    // Providers the file does not mention are untouched.
    expect(isPinned('cli-codex')).toBe(false);
    expect(catalogFor('cli-codex').map(m => m.id)).toContain('gpt-5.6-sol');
  });

  // Pinning must beat a catalog already discovered from the CLI, not just skip
  // the next discovery — otherwise the pin looks accepted and is then ignored.
  it('a pinned catalog outranks whatever the CLI discovered', () => {
    const gemini = new GeminiCliProvider({} as never) as unknown as {
      _discovered: Array<{ id: string }> | null;
      models: Array<{ id: string }>;
    };
    gemini._discovered = [{ id: 'cli-gemini/gemini-3.8-flash-high' }];
    expect(gemini.models.map(m => m.id)).toEqual(['cli-gemini/gemini-3.8-flash-high']);

    writeFileSync(process.env.CONDUIT_MODELS_FILE!, JSON.stringify({
      'cli-gemini': ['gemini-3.1-pro-high'],
    }));
    reloadCatalogs();
    expect(gemini.models.map(m => m.id)).toEqual(['cli-gemini/gemini-3.1-pro-high']);
  });

  it('keeps the defaults when the file is malformed', () => {
    writeFileSync(process.env.CONDUIT_MODELS_FILE!, '{ not json');
    reloadCatalogs();
    expect(catalogFor('cli-codex').map(m => m.id)).toContain('gpt-5.6-sol');
    expect(isPinned('cli-codex')).toBe(false);
  });
});
