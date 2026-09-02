import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-cli-auth-home'),
  };
});

const TEST_HOME = join(tmpdir(), 'conduit-bridge-cli-auth-home');

import { hasCliCredentialFile, cliSession } from '../src/providers/cli-auth.js';

function cleanHome() {
  rmSync(TEST_HOME, { recursive: true, force: true });
}

describe('CLI authentication probes', () => {
  beforeEach(() => {
    cleanHome();
  });

  afterAll(() => {
    cleanHome();
  });

  it('treats an installed but logged-out CLI as disconnected', () => {
    const session = cliSession('claude', ['definitely-not-a-real-bin-zz']);
    expect(session.installed).toBe(false);
    expect(session.authenticated).toBe(false);
    expect(session.source).toBe('CLI not installed');
  });

  it('does not treat CLI OAuth files as missing when they exist', () => {
    mkdirSync(join(TEST_HOME, '.claude'), { recursive: true });
    writeFileSync(join(TEST_HOME, '.claude', '.credentials.json'), '{"placeholder":true}');
    mkdirSync(join(TEST_HOME, '.codex'), { recursive: true });
    writeFileSync(join(TEST_HOME, '.codex', 'auth.json'), '{"placeholder":true}');
    mkdirSync(join(TEST_HOME, '.gemini'), { recursive: true });
    writeFileSync(join(TEST_HOME, '.gemini', 'oauth_creds.json'), '{"placeholder":true}');

    expect(hasCliCredentialFile('claude')).toBe(true);
    expect(hasCliCredentialFile('codex')).toBe(true);
    expect(hasCliCredentialFile('gemini')).toBe(true);
    expect(hasCliCredentialFile('grok')).toBe(false);
  });
});
