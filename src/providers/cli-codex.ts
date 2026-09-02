import type {
  BridgeConfig,
  ProviderName,
  ChatRequest,
  ModelDefinition,
  ProviderAdapter,
} from '../types.js';
import { logger } from '../logger.js';
import {
  resolveExecutable,
  runCli,
  flattenMessages,
  stripPrefix,
  agentCwd,
  DEFAULT_CLI_TIMEOUT_MS,
} from './cli-util.js';
import { cliSession } from './cli-auth.js';
import { toOpenAiEffort } from '../effort.js';
import { cliPermissionArgs } from '../cli-mode.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { catalogFor, noteForeignVendors, isModelId, isPinned, SERVED_BY, limitsFor, type CatalogEntry } from '../model-catalog.js';

// OpenAI Codex CLI (@openai/codex) — non-interactive via `codex exec`.
// Install: npm i -g @openai/codex  then  codex login
// Docs: https://www.npmjs.com/package/@openai/codex
const PREFIX = 'cli-codex/';
const BIN = 'codex';

const DISCOVERY_TTL_MS = 5 * 60_000;
const DISCOVERY_RETRY_MS = 60_000;

/**
 * ChatGPT's own model list for Codex, which is what `codex` itself asks.
 *
 * `codex` has no `models` subcommand, so this endpoint is the only way to learn
 * the account's real entitlements. It is deliberately NOT api.openai.com/v1/models:
 * that one lists API-platform models for an API key, a different entitlement set.
 * Measured here — the platform list offers gpt-5.5-pro, while a ChatGPT account
 * rejects it with "not supported when using Codex with a ChatGPT account".
 *
 * Undocumented and version-gated (`client_version` is required), so every failure
 * falls back to the catalog in model-catalog.ts rather than breaking the provider.
 */
const CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models';

interface CodexApiModel {
  slug?: string;
  display_name?: string;
  /** "hide" marks internal models (gpt-reserve, codex-auto-review). */
  visibility?: string;
  /** The account's real token window — better than any table we could ship. */
  context_window?: number;
}

/** Read the OAuth material `codex login` already stored. */
function codexAuth(): { token: string; accountId?: string } | null {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  try {
    const raw = JSON.parse(readFileSync(join(home, 'auth.json'), 'utf-8'));
    const token = raw?.tokens?.access_token;
    if (typeof token !== 'string' || !token) return null;
    const accountId = raw?.tokens?.account_id;
    return { token, accountId: typeof accountId === 'string' ? accountId : undefined };
  } catch {
    return null;
  }
}

/** Pick the user-facing models out of the endpoint's response. */
export function parseCodexModels(body: unknown): CatalogEntry[] {
  const list = (body as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of list as CodexApiModel[]) {
    const id = item?.slug;
    if (!isModelId(id) || seen.has(id)) continue;
    // "hide" is the endpoint's own marker for internal models.
    if (item.visibility === 'hide') continue;
    seen.add(id);
    const displayName = typeof item.display_name === 'string' && item.display_name.trim()
      ? item.display_name.trim()
      : undefined;
    const contextWindow = typeof item.context_window === 'number' && item.context_window > 0
      ? item.context_window
      : undefined;
    out.push({
      id,
      ...(displayName ? { displayName } : {}),
      ...(contextWindow ? { contextWindow } : {}),
    });
  }
  return noteForeignVendors('cli-codex', out);
}

export class CodexCliProvider implements ProviderAdapter {
  readonly name: ProviderName = 'cli-codex';

  private _discovered: ModelDefinition[] | null = null;
  private _attemptedAt = 0;
  private _inFlight: Promise<number> | null = null;
  private _clientVersion: string | null = null;

  /** Discovered entitlements when we have them, otherwise the catalog. */
  get models(): ModelDefinition[] {
    // A pinned catalog is the user's explicit answer and outranks discovery.
    if (!isPinned('cli-codex') && this._discovered?.length) return this._discovered;
    return catalogFor('cli-codex').map(m => ({
      id: `${PREFIX}${m.id}`,
      provider: 'cli-codex' as ProviderName,
      displayName: `${m.displayName ?? m.id} (Codex CLI)`,
      owned_by: SERVED_BY['cli-codex'],
      ...limitsFor('cli-codex', m.id),
    }));
  }

  async refreshModels(force = false): Promise<number> {
    const ttl = this._discovered ? DISCOVERY_TTL_MS : DISCOVERY_RETRY_MS;
    if (!force && Date.now() - this._attemptedAt < ttl) {
      return this._discovered?.length ?? 0;
    }
    if (this._inFlight) return this._inFlight;
    this._attemptedAt = Date.now();
    this._inFlight = this._discover().finally(() => { this._inFlight = null; });
    return this._inFlight;
  }

  /** `codex --version` -> "codex-cli 0.152.1"; the endpoint requires it. */
  private async _version(): Promise<string | null> {
    if (this._clientVersion) return this._clientVersion;
    const binPath = resolveExecutable(BIN);
    if (!binPath) return null;
    try {
      const result = await runCli({ binPath, args: ['--version'], timeoutMs: 20_000, label: 'cli-codex/version' });
      const match = /(\d+\.\d+\.\d+)/.exec(result.stdout || result.stderr);
      this._clientVersion = match ? match[1] : null;
      return this._clientVersion;
    } catch {
      return null;
    }
  }

  private async _discover(): Promise<number> {
    if (isPinned('cli-codex')) return catalogFor('cli-codex').length;
    const auth = codexAuth();
    if (!auth) return this._discovered?.length ?? 0;
    const version = await this._version();
    if (!version) return this._discovered?.length ?? 0;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${auth.token}`,
        'User-Agent': 'conduit-bridge',
      };
      if (auth.accountId) headers['chatgpt-account-id'] = auth.accountId;
      const resp = await fetch(`${CODEX_MODELS_URL}?client_version=${encodeURIComponent(version)}`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) {
        logger.warn(`[cli-codex] model endpoint returned ${resp.status}; keeping previous catalog`);
        return this._discovered?.length ?? 0;
      }
      const entries = parseCodexModels(await resp.json());
      if (!entries.length) {
        logger.warn('[cli-codex] model endpoint returned nothing usable; keeping previous catalog');
        return this._discovered?.length ?? 0;
      }
      this._discovered = entries.map(m => ({
        id: `${PREFIX}${m.id}`,
        provider: 'cli-codex' as ProviderName,
        displayName: `${m.displayName ?? m.id} (Codex CLI)`,
        owned_by: SERVED_BY['cli-codex'],
        ...limitsFor('cli-codex', m.id),
        // The endpoint reports the account's real window; it wins over the table.
        ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
      }));
      logger.info(`[cli-codex] discovered ${entries.length} models from the ChatGPT model endpoint`);
      return entries.length;
    } catch (err) {
      logger.warn(`[cli-codex] model discovery failed: ${(err as Error).message}`);
      return this._discovered?.length ?? 0;
    }
  }

  constructor(_cfg: BridgeConfig) {}

  get credentialSource(): string {
    return cliSession('codex', [BIN]).source;
  }

  ownsModel(modelId: string): boolean {
    return modelId.startsWith(PREFIX);
  }

  async checkSession(): Promise<boolean> {
    return cliSession('codex', [BIN]).authenticated;
  }

  async ensureConnected(): Promise<boolean> {
    const session = cliSession('codex', [BIN]);
    if (!session.installed) {
      logger.warn(
        '[cli-codex] `codex` not found on PATH. Install with: npm i -g @openai/codex && codex login',
      );
      return false;
    }
    if (!session.authenticated) {
      logger.warn('[cli-codex] `codex` is installed but not authenticated. Run `codex login`.');
      return false;
    }
    // TTL-guarded, so this is a no-op on all but the first call in the window.
    void this.refreshModels().catch(() => {});
    return true;
  }

  async restoreSession(): Promise<boolean> {
    return this.checkSession();
  }

  async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error(
      'cli-codex uses the local Codex CLI — install @openai/codex and run `codex login`.',
    );
  }

  async logout(): Promise<void> {
    logger.info('[cli-codex] local CLI — nothing to disconnect');
  }

  private async _run(req: ChatRequest): Promise<string> {
    const binPath = resolveExecutable(BIN);
    if (!binPath) {
      throw new Error(
        'codex CLI not found on PATH. Install with: npm i -g @openai/codex && codex login',
      );
    }

    const model = stripPrefix(req.model, PREFIX);
    const prompt = flattenMessages(req.messages);
    const effort = toOpenAiEffort(req.effort);
    const mode = req.mode ?? 'chat';

    // codex exec: final agent message on stdout; progress on stderr.
    // Prompt via stdin (`-`) to avoid ARG_MAX / Windows cmd length limits.
    // Sandbox comes from cliPermissionArgs (read-only vs workspace-write).
    // reasoning_effort via -c for GPT-5.x reasoning models.
    const args = [
      'exec',
      '-m', model,
      '--skip-git-repo-check',
      ...cliPermissionArgs('cli-codex', mode),
      ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : []),
      '-',
    ];

    const result = await runCli({
      binPath,
      args,
      stdin: prompt,
      timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      cwd: agentCwd(req),
      label: 'cli-codex',
      log: msg => logger.info(msg),
      signal: req.signal,
    });

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      const detail =
        result.aborted
          ? 'client disconnected: process terminated'
          : result.timedOut || result.exitCode === 143
          ? `timeout: codex killed by supervisor (exit ${result.exitCode})`
          : result.stderr || '(no output)';
      throw new Error(`codex exited ${result.exitCode}: ${detail}`);
    }
    return result.stdout || result.stderr;
  }

  async chat(req: ChatRequest): Promise<string> {
    return this._run(req);
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const content = await this._run(req);
    if (content) yield content;
  }
}
