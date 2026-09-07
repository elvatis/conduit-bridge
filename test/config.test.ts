import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Redirect homedir() to a throwaway temp directory so the config module never
// reads or writes the real ~/.conduit. The factory is fully self-contained so
// it works regardless of when config.ts is first evaluated. config.ts uses a
// named `import { homedir }`, so overriding the named export is sufficient.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-test-home'),
  };
});

// The mocked os.tmpdir is the real one (spread from the original module), so
// these paths mirror what config.ts computes internally.
const TEST_HOME = join(tmpdir(), 'conduit-bridge-test-home');
const CONFIG_DIR = join(TEST_HOME, '.conduit');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const TEST_VAULT_KEY = Buffer.alloc(32, 0x31).toString('base64');
const PREVIOUS_VAULT_KEY = process.env.CONDUIT_VAULT_KEY;

import {
  loadConfig,
  saveConfig,
  parseConfigValue,
  runtimeDir,
  bearerAuthorization,
  secureStorageStatus,
} from '../src/config.js';

function cleanHome() {
  rmSync(TEST_HOME, { recursive: true, force: true });
}

describe('config', () => {
  beforeEach(() => {
    cleanHome();
    process.env.CONDUIT_VAULT_KEY = TEST_VAULT_KEY;
  });

  afterAll(() => {
    cleanHome();
    if (PREVIOUS_VAULT_KEY === undefined) delete process.env.CONDUIT_VAULT_KEY;
    else process.env.CONDUIT_VAULT_KEY = PREVIOUS_VAULT_KEY;
  });

  describe('loadConfig', () => {
    it('returns the built-in defaults when no config file exists', () => {
      const cfg = loadConfig();
      expect(cfg.port).toBe(31338);
      expect(cfg.host).toBe('127.0.0.1');
      expect(cfg.logLevel).toBe('info');
      expect(cfg.apiKeys).toEqual({});
    });

    it('merges overrides on top of the defaults', () => {
      const cfg = loadConfig({ port: 9999, logLevel: 'debug' });
      expect(cfg.port).toBe(9999);
      expect(cfg.logLevel).toBe('debug');
      // untouched fields keep their default values
      expect(cfg.host).toBe('127.0.0.1');
    });

    it('does not create the config directory as a side effect', () => {
      loadConfig({ port: 1234 });
      expect(existsSync(CONFIG_DIR)).toBe(false);
    });

    it('gracefully ignores a corrupt config file and falls back to defaults', () => {
      saveConfig({ port: 4242 });
      // Corrupt the saved file
      writeFileSync(CONFIG_FILE, '{ this is not valid json');
      const cfg = loadConfig();
      expect(cfg.port).toBe(31338); // back to default, no throw
    });
  });

  describe('saveConfig', () => {
    it('persists values and reads them back on the next load (round-trip)', () => {
      expect(existsSync(CONFIG_FILE)).toBe(false);
      saveConfig({ port: 4321, logLevel: 'silent' });
      expect(existsSync(CONFIG_FILE)).toBe(true);

      const reloaded = loadConfig();
      expect(reloaded.port).toBe(4321);
      expect(reloaded.logLevel).toBe('silent');
      // defaults that were not saved are still present
      expect(reloaded.host).toBe('127.0.0.1');

      // The persisted JSON contains the saved value
      const onDisk = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      expect(onDisk.port).toBe(4321);
    });

    it('merges successive saves rather than overwriting the whole file', () => {
      saveConfig({ port: 5000 });
      saveConfig({ host: '0.0.0.0' });
      const cfg = loadConfig();
      expect(cfg.port).toBe(5000);
      expect(cfg.host).toBe('0.0.0.0');
    });

    it('lets runtime overrides win over saved values', () => {
      saveConfig({ port: 6000 });
      const cfg = loadConfig({ port: 7000 });
      expect(cfg.port).toBe(7000);
    });

    it('stores API credentials by encrypted vault reference', () => {
      saveConfig({ apiKeys: { 'claude-api': 'sk-test-123' } });
      const cfg = loadConfig();
      expect(cfg.apiKeys['claude-api']).toBe('sk-test-123');
      const configText = readFileSync(CONFIG_FILE, 'utf8');
      const vaultText = readFileSync(join(CONFIG_DIR, 'secrets.vault'), 'utf8');
      expect(configText).not.toContain('sk-test-123');
      expect(configText).toContain('vault:v1:');
      expect(vaultText).not.toContain('sk-test-123');
    });

    it('migrates legacy plaintext only after verified encrypted storage', () => {
      saveConfig({ port: 4242 });
      writeFileSync(CONFIG_FILE, JSON.stringify({
        port: 4242,
        apiKeys: { 'claude-api': 'legacy-test-value' },
      }));
      expect(loadConfig().apiKeys['claude-api']).toBe('legacy-test-value');
      const migrated = readFileSync(CONFIG_FILE, 'utf8');
      expect(migrated).not.toContain('legacy-test-value');
      expect(migrated).toContain('vault:v1:');
    });

    it('preserves a legacy file exactly when secure migration is unavailable', () => {
      saveConfig({ port: 4242 });
      const legacy = JSON.stringify({ apiKeys: { 'claude-api': 'legacy-preserved' } }, null, 2);
      writeFileSync(CONFIG_FILE, legacy);
      process.env.CONDUIT_VAULT_KEY = 'invalid';
      const loaded = loadConfig();
      expect(loaded.apiKeys['claude-api']).toBe('legacy-preserved');
      expect(readFileSync(CONFIG_FILE, 'utf8')).toBe(legacy);
      expect(secureStorageStatus()).toMatchObject({ available: false });
      process.env.CONDUIT_VAULT_KEY = TEST_VAULT_KEY;
    });

    it('fails a new credential write instead of persisting plaintext', () => {
      saveConfig({ port: 4242 });
      const before = readFileSync(CONFIG_FILE, 'utf8');
      process.env.CONDUIT_VAULT_KEY = 'invalid';
      expect(() => saveConfig({ apiKeys: { 'claude-api': 'must-not-persist' } })).toThrow();
      expect(readFileSync(CONFIG_FILE, 'utf8')).toBe(before);
      expect(readFileSync(CONFIG_FILE, 'utf8')).not.toContain('must-not-persist');
      process.env.CONDUIT_VAULT_KEY = TEST_VAULT_KEY;
    });
  });

  describe('parseConfigValue', () => {
    it('keeps authToken as a string even when it looks numeric', () => {
      expect(parseConfigValue('authToken', '12345678')).toBe('12345678');
      expect(parseConfigValue('host', '127.0.0.1')).toBe('127.0.0.1');
    });

    it('coerces known numeric fields only', () => {
      expect(parseConfigValue('port', '31338')).toBe(31338);
      expect(parseConfigValue('rateLimit.perMinute', '12')).toBe(12);
      expect(parseConfigValue('rateLimit.maxConcurrent', '4')).toBe(4);
    });
  });

  describe('bearerAuthorization', () => {
    it('omits the header when the token is empty', () => {
      expect(bearerAuthorization('')).toEqual({});
      expect(bearerAuthorization(undefined)).toEqual({});
    });

    it('sends Bearer when a token is configured', () => {
      expect(bearerAuthorization('preserve-tkn')).toEqual({ Authorization: 'Bearer preserve-tkn' });
    });
  });

  describe('runtimeDir', () => {
    it('honors CONDUIT_HOME over the default ~/.conduit', () => {
      const previous = process.env.CONDUIT_HOME;
      const override = join(TEST_HOME, 'managed-home');
      process.env.CONDUIT_HOME = override;
      try {
        expect(runtimeDir()).toBe(resolve(override));
      } finally {
        if (previous === undefined) delete process.env.CONDUIT_HOME;
        else process.env.CONDUIT_HOME = previous;
      }
    });
  });

});
