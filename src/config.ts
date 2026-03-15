import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import type { BridgeConfig } from './types.js';

const CONFIG_DIR = join(homedir(), '.conduit');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULTS: BridgeConfig = {
  port: 31338,           // different from OpenClaw's 31337 to avoid conflicts
  host: '127.0.0.1',
  profileBaseDir: join(CONFIG_DIR, 'profiles'),
  headless: false,       // show browser for login flows
  logLevel: 'info',
  apiKeys: {},
};

export function loadConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  let saved: Partial<BridgeConfig> = {};

  if (existsSync(CONFIG_FILE)) {
    try {
      saved = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      // ignore corrupt config
    }
  }

  return { ...DEFAULTS, ...saved, ...overrides };
}

export function saveConfig(cfg: Partial<BridgeConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...cfg }, null, 2));
}

export function profileDir(cfg: BridgeConfig, provider: string): string {
  return join(cfg.profileBaseDir, `${provider}-profile`);
}

export function cookieFile(cfg: BridgeConfig, provider: string): string {
  return join(CONFIG_DIR, `${provider}-expiry.json`);
}
