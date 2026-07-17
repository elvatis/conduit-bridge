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
  // Secure defaults: only localhost origins are allowed for CORS, no auth
  // token (opt-in), and the Chromium sandbox stays ON (opt-in --no-sandbox).
  allowedOrigins: ['http://localhost', 'http://127.0.0.1'],
  authToken: '',
  chromiumNoSandbox: false,
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

/**
 * Load environment variables from `.env` files into `process.env` so provider
 * keys can be supplied that way (OPENROUTER_API_KEY, PERPLEXITY_API_KEY,
 * ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, LM_STUDIO_URL, …).
 *
 * Files are read in this order, and an already-set variable is NEVER
 * overridden — the real shell environment always wins, and an earlier file
 * wins over a later one:
 *   1. `<cwd>/.env`        — a .env in the directory you run the bridge from
 *   2. `~/.conduit/.env`   — a global .env next to config.json
 *
 * Minimal, dependency-free parser: `KEY=VALUE` lines, `#` comments, blank
 * lines, an optional `export ` prefix, and surrounding single/double quotes.
 * Returns the names (not values) of the variables it set.
 */
export function loadDotEnv(dirs: string[] = [process.cwd(), CONFIG_DIR]): string[] {
  const loaded: string[] = [];
  for (const dir of dirs) {
    const file = join(dir, '.env');
    if (!existsSync(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue; // unreadable — skip
    }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const body = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
      const eq = body.indexOf('=');
      if (eq <= 0) continue;
      const key = body.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue; // shell / earlier file wins
      let val = body.slice(eq + 1).trim();
      const q = val[0];
      if ((q === '"' || q === "'") && val.length >= 2 && val[val.length - 1] === q) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
      loaded.push(key);
    }
  }
  return loaded;
}

export function profileDir(cfg: BridgeConfig, provider: string): string {
  return join(cfg.profileBaseDir, `${provider}-profile`);
}

export function cookieFile(cfg: BridgeConfig, provider: string): string {
  return join(CONFIG_DIR, `${provider}-expiry.json`);
}
