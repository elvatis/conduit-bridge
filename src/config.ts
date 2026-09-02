import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import type { BridgeConfig } from './types.js';

const NUMERIC_FIELDS = new Set(['port', 'perMinute', 'maxConcurrent']);

/** Central runtime directory. Override for a managed desktop installation. */
export function runtimeDir(): string {
  return resolve(process.env.CONDUIT_HOME || join(homedir(), '.conduit'));
}

function configFile(): string {
  return join(runtimeDir(), 'config.json');
}

/**
 * Coerce a `conduit-bridge config` value. Only known numeric fields become
 * numbers — authToken, host, and other strings stay strings even when they
 * look like digits (Buffer.from(number) allocates by size, not by UTF-8).
 */
export function parseConfigValue(key: string, raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const leaf = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
  if (NUMERIC_FIELDS.has(leaf) && trimmed !== '' && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* keep raw string */ }
  }
  return raw;
}

/** Authorization header when a bearer token is configured. */
export function bearerAuthorization(token?: string): Record<string, string> {
  const value = typeof token === 'string' ? token.trim() : '';
  return value ? { Authorization: `Bearer ${value}` } : {};
}

const DEFAULTS: BridgeConfig = {
  port: 31338,           // different from OpenClaw's 31337 to avoid conflicts
  host: '127.0.0.1',
  logLevel: 'info',
  apiKeys: {},
  // Secure defaults: only localhost origins are allowed for CORS, no auth
  // token (opt-in).
  allowedOrigins: ['http://localhost', 'http://127.0.0.1'],
  authToken: '',
  rateLimit: { perMinute: 60, maxConcurrent: 16 },
};

export function loadConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  let saved: Partial<BridgeConfig> = {};

  const file = configFile();
  if (existsSync(file)) {
    try {
      saved = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      // ignore corrupt config
    }
  }

  return { ...DEFAULTS, ...saved, ...overrides };
}
export function saveConfig(cfg: Partial<BridgeConfig>): void {
  const dir = runtimeDir();
  const file = join(dir, 'config.json');
  mkdirSync(dir, { recursive: true });
  const existing = loadConfig();
  writeFileSync(file, JSON.stringify({ ...existing, ...cfg }, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
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
export function loadDotEnv(dirs: string[] = [process.cwd(), runtimeDir()]): string[] {
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
