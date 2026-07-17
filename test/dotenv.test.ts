import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv } from '../src/config.js';

const TEST_KEYS = [
  'CONDUIT_TEST_A',
  'CONDUIT_TEST_B',
  'CONDUIT_TEST_EXPORT',
  'CONDUIT_TEST_QUOTED',
  'CONDUIT_TEST_SHELL',
  'CONDUIT_TEST_PRECEDENCE',
];

function clearTestKeys(): void {
  for (const k of TEST_KEYS) delete process.env[k];
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'conduit-dotenv-'));
}

describe('loadDotEnv', () => {
  afterEach(clearTestKeys);

  it('parses KEY=VALUE, skipping comments/blanks, honoring export and quotes', () => {
    clearTestKeys();
    const dir = tmp();
    writeFileSync(
      join(dir, '.env'),
      [
        '# a comment',
        '',
        'CONDUIT_TEST_A=plain',
        'export CONDUIT_TEST_EXPORT=exported',
        'CONDUIT_TEST_QUOTED="quoted value"',
        "CONDUIT_TEST_B='single'",
        'not a valid line',
        '=nokey',
      ].join('\n'),
    );
    const loaded = loadDotEnv([dir]);
    expect(process.env.CONDUIT_TEST_A).toBe('plain');
    expect(process.env.CONDUIT_TEST_EXPORT).toBe('exported');
    expect(process.env.CONDUIT_TEST_QUOTED).toBe('quoted value');
    expect(process.env.CONDUIT_TEST_B).toBe('single');
    expect(loaded).toEqual(
      expect.arrayContaining(['CONDUIT_TEST_A', 'CONDUIT_TEST_EXPORT', 'CONDUIT_TEST_QUOTED', 'CONDUIT_TEST_B']),
    );
    expect(loaded).toHaveLength(4); // the invalid line and '=nokey' are ignored
    rmSync(dir, { recursive: true, force: true });
  });

  it('never overrides a variable already set in the environment', () => {
    clearTestKeys();
    process.env.CONDUIT_TEST_SHELL = 'from-shell';
    const dir = tmp();
    writeFileSync(join(dir, '.env'), 'CONDUIT_TEST_SHELL=from-file\n');
    const loaded = loadDotEnv([dir]);
    expect(process.env.CONDUIT_TEST_SHELL).toBe('from-shell');
    expect(loaded).not.toContain('CONDUIT_TEST_SHELL');
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives an earlier directory precedence over a later one', () => {
    clearTestKeys();
    const a = tmp();
    const b = tmp();
    writeFileSync(join(a, '.env'), 'CONDUIT_TEST_PRECEDENCE=from-A\n');
    writeFileSync(join(b, '.env'), 'CONDUIT_TEST_PRECEDENCE=from-B\n');
    loadDotEnv([a, b]);
    expect(process.env.CONDUIT_TEST_PRECEDENCE).toBe('from-A');
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  });

  it('is a no-op returning [] when no .env exists', () => {
    const dir = tmp();
    expect(loadDotEnv([dir])).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
