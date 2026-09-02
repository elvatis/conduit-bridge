import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { logger } from './logger.js';

/**
 * CLI model catalogs, as data rather than code.
 *
 * `cli-gemini` and `cli-grok` learn their catalogs at runtime from `agy models`
 * and `grok models`. `cli-claude` and `cli-codex` cannot: neither binary exposes
 * a model-listing subcommand, so their lists have to be written down somewhere.
 * Keeping them in TypeScript meant a new bridge build for every model release.
 *
 * They live here as defaults, and any of them can be overridden from
 * `~/.conduit/models.json` (or `$CONDUIT_MODELS_FILE`) with no rebuild:
 *
 *   {
 *     "cli-claude": ["claude-opus-5", "claude-sonnet-5"],
 *     "cli-codex":  [{ "id": "gpt-5.6-sol", "displayName": "GPT-5.6 Sol" }]
 *   }
 *
 * Naming a provider PINS it: that list is used verbatim and runtime discovery is
 * skipped for it. That is the escape hatch for a CLI that is offline, or whose
 * `models` output the bridge cannot parse. Providers the file does not mention
 * are unaffected.
 */

export type CatalogProvider = 'cli-claude' | 'cli-codex' | 'cli-gemini' | 'cli-grok';

export interface CatalogEntry {
  id: string;
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

/**
 * Token window and output cap, for the providers that do not report them.
 *
 * The Codex endpoint returns `context_window` and OpenRouter returns
 * `context_length`, so those are discovered. `agy`, `claude` and `grok` report
 * nothing, and the numbers have to be written down somewhere — here, once,
 * rather than in every client, and overridable from `~/.conduit/models.json`:
 *
 *   { "cli-claude": [{ "id": "claude-opus-6", "contextWindow": 2000000 }] }
 *
 * Keys are matched longest-prefix-first, so a family entry covers a whole
 * generation and a specific id can still override it.
 */
const LIMITS: Array<[prefix: string, contextWindow: number, maxOutputTokens: number]> = [
  ['claude-haiku', 200_000, 64_000],
  ['claude-', 1_000_000, 128_000],
  ['gemini-', 1_000_000, 65_536],
  ['grok-', 256_000, 131_072],
  ['gpt-oss', 128_000, 32_768],
  ['gpt-', 400_000, 128_000],
];

/** Fallbacks per provider, for an id no prefix above matches. */
const PROVIDER_LIMITS: Record<CatalogProvider, [number, number]> = {
  'cli-claude': [200_000, 64_000],
  'cli-codex': [272_000, 128_000],
  'cli-gemini': [1_000_000, 65_536],
  'cli-grok': [256_000, 131_072],
};

/** Best known token window and output cap for a bare model id. */
export function limitsFor(
  provider: CatalogProvider,
  id: string,
): { contextWindow: number; maxOutputTokens: number } {
  const match = LIMITS
    .filter(([prefix]) => id.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (match) return { contextWindow: match[1], maxOutputTokens: match[2] };
  const [ctx, max] = PROVIDER_LIMITS[provider];
  return { contextWindow: ctx, maxOutputTokens: max };
}

const PROVIDERS: CatalogProvider[] = ['cli-claude', 'cli-codex', 'cli-gemini', 'cli-grok'];

/**
 * Shipped defaults.
 *
 * For the two discovering providers these are seeds only — what we advertise
 * before the first `models` call answers, and when the CLI is missing or logged
 * out. For cli-claude and cli-codex they are the whole catalog.
 */
const DEFAULTS: Record<CatalogProvider, string[]> = {
  // Claude Code models (2026-08): Opus 5, Sonnet 5, Haiku 4.5, Fable 5.
  'cli-claude': ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5'],
  // Codex CLI. Each of these was run against the real binary; `gpt-5.5-pro` was
  // dropped because it comes back "not supported when using Codex with a ChatGPT
  // account". Availability is plan-dependent, so anyone whose plan does include a
  // model can add it in models.json rather than waiting for a release.
  'cli-codex': ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
  'cli-gemini': ['gemini-3.1-pro-high', 'gemini-3.1-pro-low'],
  'cli-grok': ['grok-4.6'],
};

/** Guard against a runaway file; nobody has thousands of CLI models. */
const MAX_ENTRIES = 200;

/**
 * Model ids are lowercase slugs with `-` and `.` as separators. The separators
 * are kept OUT of the segment class on purpose: overlapping them makes the two
 * quantifiers ambiguous and the pattern backtracks exponentially.
 */
const MODEL_ID = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;

export function isModelId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && MODEL_ID.test(value);
}

/**
 * The vendor family each CLI provider's own models come from.
 *
 * A prefix names a TRANSPORT, not a vendor. `agy` resells Anthropic and GPT-OSS
 * models alongside Google's, and reaching Claude Sonnet through an Antigravity
 * subscription — different quota, auth and rate limits than an Anthropic one —
 * is a real capability, not an accident. Those ids stay available.
 *
 * Nothing collides: every advertised id is `<prefix>/<model>`, the four prefixes
 * are distinct, and `providerForModel` resolves by exact id first and by prefix
 * second, so `cli-gemini/claude-sonnet-4-6` and `cli-claude/claude-sonnet-4-6`
 * are different strings reaching different provider classes. This map is used
 * only to LABEL a foreign model, never to drop it.
 */
const VENDOR_PATTERN: Record<CatalogProvider, RegExp> = {
  'cli-claude': /^claude-/,
  'cli-codex': /^(?:gpt|codex|o[0-9])/,
  'cli-gemini': /^gemini-/,
  'cli-grok': /^grok-/,
};

/** True when this model id belongs to the provider's own vendor. */
export function belongsToProvider(provider: CatalogProvider, id: string): boolean {
  return VENDOR_PATTERN[provider].test(id);
}

/**
 * Which CLI actually serves this provider's models.
 *
 * `owned_by` reports the TRANSPORT, not a guess at the model's author. Deriving
 * the author from the id prefix conflates who built a model with where you can
 * obtain it, and those differ: `gpt-oss-120b-medium` is OpenAI's open-weight
 * model, is served here by agy, and is not available from OpenAI at all — so
 * labelling it `openai` would advertise a route that does not exist. The author
 * is already legible in the id and the display name; what a caller cannot
 * otherwise tell is which subscription answers.
 */
export const SERVED_BY: Record<CatalogProvider, string> = {
  'cli-claude': 'claude-code',
  'cli-codex': 'codex',
  'cli-gemini': 'agy',
  'cli-grok': 'grok',
};

/**
 * Note foreign-vendor ids without removing them.
 *
 * Returns `entries` unchanged — a CLI reselling another vendor's model is a
 * feature, and dropping those ids only removed them from the picker while
 * `ownsModel` kept routing them anyway. The log line is what makes the
 * cross-vendor route visible instead of surprising.
 */
export function noteForeignVendors<T extends { id: string }>(
  provider: CatalogProvider,
  entries: T[],
): T[] {
  const foreign = entries.filter(e => !belongsToProvider(provider, e.id)).map(e => e.id);
  if (foreign.length) {
    logger.info(
      `[catalog] ${provider}: also serving ${foreign.length} model(s) from another vendor ` +
        `(${foreign.join(', ')}) — reachable through this CLI's own subscription`,
    );
  }
  return entries;
}

export function catalogFilePath(): string {
  const explicit = process.env.CONDUIT_MODELS_FILE;
  if (explicit) return resolve(explicit);
  const home = resolve(process.env.CONDUIT_HOME || join(homedir(), '.conduit'));
  return join(home, 'models.json');
}

/** Normalize one provider's entry from the file; returns [] if unusable. */
export function parseCatalogEntries(raw: unknown): CatalogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_ENTRIES)) {
    let id: unknown;
    let displayName: string | undefined;
    let contextWindow: number | undefined;
    let maxOutputTokens: number | undefined;
    if (typeof item === 'string') {
      id = item;
    } else if (item && typeof item === 'object') {
      id = (item as { id?: unknown }).id;
      const dn = (item as { displayName?: unknown }).displayName;
      if (typeof dn === 'string' && dn.trim()) displayName = dn.trim().slice(0, 120);
      const cw = (item as { contextWindow?: unknown }).contextWindow;
      if (typeof cw === 'number' && cw > 0) contextWindow = Math.floor(cw);
      const mo = (item as { maxOutputTokens?: unknown }).maxOutputTokens;
      if (typeof mo === 'number' && mo > 0) maxOutputTokens = Math.floor(mo);
    }
    if (!isModelId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, ...(displayName ? { displayName } : {}), ...(contextWindow ? { contextWindow } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}) });
  }
  return out;
}

/** Validate a whole parsed models.json. Unknown providers are ignored. */
export function parseCatalogFile(json: unknown): Partial<Record<CatalogProvider, CatalogEntry[]>> {
  const out: Partial<Record<CatalogProvider, CatalogEntry[]>> = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return out;
  for (const provider of PROVIDERS) {
    const raw = (json as Record<string, unknown>)[provider];
    if (raw === undefined) continue;
    // A pin may legitimately name a resold model (cli-gemini/claude-sonnet-4-6);
    // note it, do not drop it.
    const entries = noteForeignVendors(provider, parseCatalogEntries(raw));
    // An empty or all-invalid list is a mistake, not "advertise nothing".
    if (entries.length) out[provider] = entries;
    else logger.warn(`[catalog] ${provider} in models.json has no usable model ids; ignoring it`);
  }
  return out;
}

let _cache: Partial<Record<CatalogProvider, CatalogEntry[]>> = {};
let _cacheKey = '';

/** Re-read the override file when its path or mtime changed. */
function overrides(): Partial<Record<CatalogProvider, CatalogEntry[]>> {
  const file = catalogFilePath();
  let key = file + ':missing';
  try {
    if (existsSync(file)) key = `${file}:${statSync(file).mtimeMs}`;
  } catch {
    /* fall through with the :missing key */
  }
  if (key === _cacheKey) return _cache;
  _cacheKey = key;

  if (key.endsWith(':missing')) {
    _cache = {};
    return _cache;
  }
  try {
    _cache = parseCatalogFile(JSON.parse(readFileSync(file, 'utf-8')));
    const named = Object.keys(_cache);
    if (named.length) logger.info(`[catalog] models.json pins: ${named.join(', ')}`);
  } catch (err) {
    logger.warn(`[catalog] could not read ${file}: ${(err as Error).message}; using built-in defaults`);
    _cache = {};
  }
  return _cache;
}

/** Force the next read to hit disk — used by POST /v1/models/refresh. */
export function reloadCatalogs(): void {
  _cacheKey = '';
}

/** True when models.json pins this provider, which also disables discovery. */
export function isPinned(provider: CatalogProvider): boolean {
  return overrides()[provider] !== undefined;
}

/** The catalog to advertise for a provider, override first then shipped default. */
export function catalogFor(provider: CatalogProvider): CatalogEntry[] {
  return overrides()[provider] ?? DEFAULTS[provider].map(id => ({ id }));
}
