import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

import { cookieFile, loadConfig, profileDir, saveConfig } from '../src/config.js';
import type { BridgeConfig } from '../src/types.js';

function cleanHome() {
  rmSync(TEST_HOME, { recursive: true, force: true });
}

describe('config', () => {
  beforeEach(() => {
    cleanHome();
  });

  afterAll(() => {
    cleanHome();
  });

  describe('loadConfig', () => {
    it('returns the built-in defaults when no config file exists', () => {
      const cfg = loadConfig();
      expect(cfg.port).toBe(31338);
      expect(cfg.host).toBe('127.0.0.1');
      expect(cfg.headless).toBe(false);
      expect(cfg.logLevel).toBe('info');
      expect(cfg.apiKeys).toEqual({});
      expect(cfg.profileBaseDir).toBe(join(CONFIG_DIR, 'profiles'));
    });

    it('merges overrides on top of the defaults', () => {
      const cfg = loadConfig({ port: 9999, logLevel: 'debug' });
      expect(cfg.port).toBe(9999);
      expect(cfg.logLevel).toBe('debug');
      // untouched fields keep their default values
      expect(cfg.host).toBe('127.0.0.1');
      expect(cfg.headless).toBe(false);
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

    it('persists nested apiKeys', () => {
      saveConfig({ apiKeys: { 'claude-api': 'sk-test-123' } });
      const cfg = loadConfig();
      expect(cfg.apiKeys['claude-api']).toBe('sk-test-123');
    });
  });

  describe('path helpers', () => {
    const cfg: BridgeConfig = {
      port: 31338,
      host: '127.0.0.1',
      profileBaseDir: join(CONFIG_DIR, 'profiles'),
      headless: false,
      logLevel: 'info',
      apiKeys: {},
    };

    it('profileDir joins the base dir with a per-provider folder', () => {
      const dir = profileDir(cfg, 'grok');
      expect(dir).toBe(join(cfg.profileBaseDir, 'grok-profile'));
    });

    it('cookieFile lives under the config dir and is named per provider', () => {
      const file = cookieFile(cfg, 'claude');
      expect(file).toBe(join(CONFIG_DIR, 'claude-expiry.json'));
      expect(file.endsWith('claude-expiry.json')).toBe(true);
    });
  });
});
