import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, renameSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type {
  ApiKeyConfig,
  ApiProviderName,
  BridgeConfig,
  SecretReference,
  SecurityStorageConfig,
} from './types.js';
import { isSecretReference, openSecretVault, secretStorageOptions } from './secrets.js';

const NUMERIC_FIELDS = new Set(['port', 'perMinute', 'perHour', 'perDay', 'costPerCall', 'maxConcurrent']);

/** Central runtime directory. Override for a managed desktop installation. */
export function runtimeDir(): string {
  return resolve(process.env.CONDUIT_HOME || join(homedir(), '.conduit'));
}

function configFile(): string {
  return join(runtimeDir(), 'config.json');
}

let lastStorageError: string | undefined;
let lastStorageAvailable: boolean | undefined;

export function secureStorageStatus(): { available: boolean | undefined; error?: string } {
  return lastStorageError
    ? { available: false, error: lastStorageError }
    : { available: lastStorageAvailable };
}

function storageOptions(securityStorage?: SecurityStorageConfig) {
  return secretStorageOptions(securityStorage, runtimeDir());
}

function readPersistedConfig(): Partial<BridgeConfig> {
  const file = configFile();
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Partial<BridgeConfig>
      : {};
  } catch {
    return {};
  }
}

function writeConfigFile(value: Partial<BridgeConfig>): void {
  const file = configFile();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    chmodSync(temp, 0o600);
    renameSync(temp, file);
    chmodSync(file, 0o600);
  } finally {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* best effort */ }
  }
}

function persistedRefs(saved: Partial<BridgeConfig>): Partial<Record<ApiProviderName, SecretReference>> {
  const refs: Partial<Record<ApiProviderName, SecretReference>> = {};
  for (const [provider, ref] of Object.entries(saved.apiKeyRefs ?? {})) {
    if (isSecretReference(ref)) refs[provider as ApiProviderName] = ref;
  }
  return refs;
}

function resolvePersistedKeys(saved: Partial<BridgeConfig>): ApiKeyConfig {
  const resolved: ApiKeyConfig = {};
  const refs = persistedRefs(saved);
  if (!Object.keys(refs).length) return resolved;
  try {
    const vault = openSecretVault(storageOptions(saved.securityStorage));
    for (const [provider, ref] of Object.entries(refs) as [ApiProviderName, SecretReference][]) {
      const value = vault.get(ref);
      if (value) resolved[provider] = value;
    }
    lastStorageError = undefined;
    lastStorageAvailable = true;
  } catch (err) {
    lastStorageAvailable = false;
    lastStorageError = `Stored provider credentials are unavailable: ${(err as Error).message}`;
  }
  return resolved;
}

function legacyApiKeys(saved: Partial<BridgeConfig>): ApiKeyConfig {
  const keys: ApiKeyConfig = {};
  if (!saved.apiKeys || typeof saved.apiKeys !== 'object') return keys;
  for (const [provider, value] of Object.entries(saved.apiKeys) as [ApiProviderName, unknown][]) {
    if (typeof value === 'string' && value.trim()) keys[provider] = value;
  }
  return keys;
}

/**
 * Move legacy config.json credentials into the encrypted vault. The plaintext
 * file is replaced only after every value can be read back from its new ref.
 */
function migrateLegacyApiKeys(saved: Partial<BridgeConfig>): ApiKeyConfig {
  const legacy = legacyApiKeys(saved);
  if (!Object.keys(legacy).length) return legacy;
  try {
    const vault = openSecretVault(storageOptions(saved.securityStorage));
    const refs = persistedRefs(saved);
    for (const [provider, value] of Object.entries(legacy) as [ApiProviderName, string][]) {
      refs[provider] = vault.put(value, refs[provider]);
    }
    for (const [provider, value] of Object.entries(legacy) as [ApiProviderName, string][]) {
      const ref = refs[provider];
      if (!ref || vault.get(ref) !== value) throw new Error(`vault verification failed for ${provider}`);
    }
    const sanitized = { ...saved, apiKeys: {}, apiKeyRefs: refs };
    writeConfigFile(sanitized);
    lastStorageError = undefined;
    lastStorageAvailable = true;
  } catch (err) {
    // Preserve the original config byte-for-byte on migration failure. Existing
    // installs keep running, but future credential writes still fail closed.
    lastStorageError = `Legacy provider credentials could not be migrated: ${(err as Error).message}`;
    lastStorageAvailable = false;
  }
  return legacy;
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

/** Return a CLI-safe view of configuration without credential material or verifiers. */
export function redactConfigForDisplay(current: BridgeConfig): Record<string, unknown> {
  const { apiKeys, apiKeyRefs: _apiKeyRefs, authToken, platformAuth: _platformAuth, ...safe } = current;
  return {
    ...safe,
    apiKeys: Object.fromEntries(Object.keys(apiKeys ?? {}).map(name => [name, 'configured'])),
    ...(authToken !== undefined ? { authToken: authToken ? 'configured' : '' } : {}),
  };
}

const DEFAULTS: BridgeConfig = {
  port: 31338,           // different from OpenClaw's 31337 to avoid conflicts
  host: '127.0.0.1',
  logLevel: 'info',
  apiKeys: {},
  agentPolicies: {},
  // Secure defaults: only localhost origins are allowed for CORS, no auth
  // token (opt-in).
  allowedOrigins: ['http://localhost', 'http://127.0.0.1'],
  authToken: '',
  rateLimit: { perMinute: 60, maxConcurrent: 16 },
};

export function loadConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  const initial = readPersistedConfig();
  const legacy = migrateLegacyApiKeys(initial);
  const saved = readPersistedConfig();
  const referenced = resolvePersistedKeys(saved);
  const overrideKeys = overrides.apiKeys ?? {};
  return {
    ...DEFAULTS,
    ...saved,
    ...overrides,
    apiKeys: { ...legacy, ...referenced, ...overrideKeys },
  };
}
export function saveConfig(cfg: Partial<BridgeConfig>): void {
  const existing = readPersistedConfig();
  const merged: Partial<BridgeConfig> = { ...DEFAULTS, ...existing, ...cfg };
  if (cfg.apiKeys !== undefined) {
    const refs = persistedRefs(existing);
    const legacy = legacyApiKeys(existing);
    const requested = { ...legacy, ...cfg.apiKeys };
    const vault = openSecretVault(storageOptions(merged.securityStorage));
    for (const [provider, value] of Object.entries(requested) as [ApiProviderName, unknown][]) {
      if (typeof value !== 'string') continue;
      if (!value.trim()) continue;
      refs[provider] = vault.put(value, refs[provider]);
    }
    for (const [provider, value] of Object.entries(requested) as [ApiProviderName, unknown][]) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const ref = refs[provider];
      if (!ref || vault.get(ref) !== value) throw new Error(`vault verification failed for ${provider}`);
    }
    merged.apiKeys = {};
    merged.apiKeyRefs = refs;
    lastStorageError = undefined;
    lastStorageAvailable = true;
  }
  writeConfigFile(merged);
}

export function resolveSecretReference(
  ref: SecretReference,
  securityStorage?: SecurityStorageConfig,
): string | undefined {
  try {
    const value = openSecretVault(storageOptions(securityStorage)).get(ref);
    lastStorageError = undefined;
    lastStorageAvailable = true;
    return value;
  } catch (err) {
    lastStorageError = `Stored provider credential is unavailable: ${(err as Error).message}`;
    lastStorageAvailable = false;
    return undefined;
  }
}

export function storeApiCredential(
  provider: ApiProviderName,
  value: string,
  securityStorage?: SecurityStorageConfig,
): SecretReference {
  if (typeof value !== 'string' || !value.trim()) throw new Error('provider credential must not be empty');
  const existing = readPersistedConfig();
  const refs = persistedRefs(existing);
  const vault = openSecretVault(storageOptions(securityStorage ?? existing.securityStorage));
  const ref = vault.put(value.trim(), refs[provider]);
  if (vault.get(ref) !== value.trim()) throw new Error(`vault verification failed for ${provider}`);
  refs[provider] = ref;
  const remainingLegacy = { ...legacyApiKeys(existing) };
  delete remainingLegacy[provider];
  writeConfigFile({
    ...existing,
    apiKeys: remainingLegacy,
    apiKeyRefs: refs,
    ...(securityStorage ? { securityStorage } : {}),
  });
  lastStorageError = undefined;
  lastStorageAvailable = true;
  return ref;
}

export function deleteApiCredential(
  provider: ApiProviderName,
  securityStorage?: SecurityStorageConfig,
): boolean {
  const existing = readPersistedConfig();
  const refs = persistedRefs(existing);
  const ref = refs[provider];
  const remainingLegacy = { ...legacyApiKeys(existing) };
  const hadLegacy = Object.hasOwn(remainingLegacy, provider);
  delete remainingLegacy[provider];
  if (!ref && !hadLegacy) return false;
  delete refs[provider];
  // Commit the config first; an orphaned encrypted value is safer than a config
  // that points at a value deleted before the metadata update completed.
  writeConfigFile({ ...existing, apiKeys: remainingLegacy, apiKeyRefs: refs });
  if (ref) openSecretVault(storageOptions(securityStorage ?? existing.securityStorage)).delete(ref);
  lastStorageError = undefined;
  lastStorageAvailable = true;
  return true;
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
