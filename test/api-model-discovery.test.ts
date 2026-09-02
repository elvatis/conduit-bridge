import { describe, expect, it } from 'vitest';
import { parseAnthropicModels } from '../src/providers/claude-api.js';
import { parseGoogleModels } from '../src/providers/gemini-api.js';

// Shapes taken from the vendors' documented models-list responses. These three
// providers have no API key configured on the maintainer's machine, so the live
// path is unverified — the parsers are what these tests pin down.

describe('parseAnthropicModels', () => {
  // platform.claude.com/docs/en/api/models-list
  const BODY = {
    data: [
      { type: 'model', id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-08-01T00:00:00Z' },
      { type: 'model', id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-08-01T00:00:00Z' },
    ],
    has_more: false,
  };

  it('reads id and display_name', () => {
    expect(parseAnthropicModels(BODY)).toEqual([
      { id: 'claude-opus-5', displayName: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
    ]);
  });

  it('survives a missing display_name', () => {
    expect(parseAnthropicModels({ data: [{ id: 'claude-x' }] }))
      .toEqual([{ id: 'claude-x', displayName: undefined }]);
  });

  it('de-duplicates and ignores entries without a usable id', () => {
    expect(parseAnthropicModels({
      data: [{ id: 'claude-x' }, { id: 'claude-x' }, { id: '' }, { id: 42 }, {}, null],
    })).toEqual([{ id: 'claude-x', displayName: undefined }]);
  });

  it('returns nothing for an error body or an unexpected shape', () => {
    expect(parseAnthropicModels({ error: { message: 'invalid x-api-key' } })).toEqual([]);
    expect(parseAnthropicModels({ data: 'nope' })).toEqual([]);
    expect(parseAnthropicModels(null)).toEqual([]);
  });
});

describe('parseGoogleModels', () => {
  // ai.google.dev/api/models#method:-models.list
  const BODY = {
    models: [
      {
        name: 'models/gemini-3.7-flash',
        displayName: 'Gemini 3.7 Flash',
        supportedGenerationMethods: ['generateContent', 'countTokens'],
      },
      {
        name: 'models/text-embedding-004',
        displayName: 'Text Embedding 004',
        supportedGenerationMethods: ['embedContent'],
      },
      {
        name: 'models/gemini-3.1-pro-preview',
        displayName: 'Gemini 3.1 Pro Preview',
        supportedGenerationMethods: ['generateContent'],
      },
    ],
  };

  it('strips the "models/" prefix Google puts on every name', () => {
    expect(parseGoogleModels(BODY).map(m => m.id))
      .toEqual(['gemini-3.7-flash', 'gemini-3.1-pro-preview']);
  });

  // An embedder in the chat picker is a model that can only fail when selected.
  it('drops anything that cannot do generateContent', () => {
    expect(parseGoogleModels(BODY).map(m => m.id)).not.toContain('text-embedding-004');
  });

  it('keeps a model that does not declare its methods at all', () => {
    expect(parseGoogleModels({ models: [{ name: 'models/gemini-x' }] }))
      .toEqual([{ id: 'gemini-x', displayName: undefined }]);
  });

  it('returns nothing for an error body or an unexpected shape', () => {
    expect(parseGoogleModels({ error: { code: 401, message: 'invalid credentials' } })).toEqual([]);
    expect(parseGoogleModels({ models: 'nope' })).toEqual([]);
    expect(parseGoogleModels(undefined)).toEqual([]);
  });
});
