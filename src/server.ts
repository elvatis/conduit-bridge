import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { BridgeConfig, ProviderName } from './types.js';
import { ProviderRegistry } from './registry.js';
import { logger } from './logger.js';
import { effortCapabilities, pickEffort } from './effort.js';
import { parseCliRunMode, agentModeCwdError } from './cli-mode.js';
import { DASHBOARD_HTML, HELP_HTML } from './dashboard.js';
import { MetricsStore } from './metrics.js';
import { saveConfig } from './config.js';
import { ActivityLog } from './activity.js';
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig, type OrchestrationStrategy } from './orchestrator.js';
import { RequestLimiter } from './limits.js';
import { RunHistory } from './run-history.js';

const CLI_PROVIDERS = new Set<ProviderName>(['cli-claude', 'cli-codex', 'cli-gemini', 'cli-grok']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

export class BridgeServer {
  private _registry: ProviderRegistry;
  private _server: ReturnType<typeof createServer> | null = null;
  private _cfg: BridgeConfig;
  private _metrics = new MetricsStore();
  private _activity = new ActivityLog();
  private _orchestrator: OrchestratorConfig = structuredClone(DEFAULT_ORCHESTRATOR);
  private _limiter = new RequestLimiter();
  private _runHistory = new RunHistory();
  private _eventSockets = new Set<Duplex>();
  private _unsubscribeActivity: (() => void) | null = null;

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
    this._registry = new ProviderRegistry(cfg);
    this._orchestrator = structuredClone(cfg.orchestrator ?? DEFAULT_ORCHESTRATOR);
  }

  get registry(): ProviderRegistry {
    return this._registry;
  }

  async start(): Promise<void> {
    this._server = createServer((req, res) => {
      this._handleRequest(req, res).catch(err => {
        logger.error(`Unhandled request error: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message, type: 'internal_error' } }));
        }
      });
    });
    this._unsubscribeActivity = this._activity.subscribe(event => this._broadcast({ type: 'activity', event }));
    this._server.on('upgrade', (req, socket, head) => this._handleUpgrade(req, socket, head));

    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._cfg.port, this._cfg.host, () => {
        logger.info(`Proxy listening on ${this._cfg.host}:${this._cfg.port}`);
        this._activity.add('success', 'system', 'Bridge started');
        resolve();
      });
      this._server!.on('error', reject);
    });

    // Refresh remote API catalogs after the server is up (non-blocking).
    setTimeout(() => {
      this._registry.refreshApiModels().catch(err => logger.warn(`Model catalog refresh error: ${err.message}`));
    }, 3000);
  }

  async stop(): Promise<void> {
    if (this._server) {
      this._unsubscribeActivity?.();
      this._unsubscribeActivity = null;
      for (const socket of this._eventSockets) socket.destroy();
      this._eventSockets.clear();
      await new Promise<void>(resolve => this._server!.close(() => resolve()));
      this._server = null;
      logger.info('Proxy stopped');
    }
  }

  /** Push one event to every connected dashboard. Never throws. */
  private _broadcast(payload: Record<string, unknown>): void {
    if (!this._eventSockets.size) return;
    let frame: Buffer;
    try {
      frame = websocketFrame(JSON.stringify(payload));
    } catch {
      return;
    }
    for (const socket of this._eventSockets) {
      try { socket.write(frame); } catch { this._eventSockets.delete(socket); socket.destroy(); }
    }
  }

  /** WebSocket clients cannot set Authorization; accept a conduit-token.* subprotocol or ?token=. */
  private _checkSocketAuth(req: IncomingMessage): { ok: boolean; protocol?: string } {
    if (this._checkAuth(req)) return { ok: true };
    const token = String(this._cfg.authToken ?? '');
    if (!token) return { ok: false };

    const offered = String(req.headers['sec-websocket-protocol'] ?? '')
      .split(',').map(p => p.trim()).filter(Boolean);
    for (const protocol of offered) {
      if (protocol.startsWith('conduit-token.') && safeEqual(protocol.slice('conduit-token.'.length), token)) {
        return { ok: true, protocol };
      }
    }

    const query = (req.url ?? '').split('?')[1] ?? '';
    const provided = new URLSearchParams(query).get('token') ?? '';
    if (provided && safeEqual(provided, token)) return { ok: true };
    return { ok: false };
  }

  private _handleUpgrade(req: IncomingMessage, socket: Duplex, _head: Buffer): void {
    // A WebSocket upgrade is exempt from the same-origin policy and from CORS,
    // so a foreign page could otherwise subscribe to the event stream and read
    // activity data. A browser always sends Origin on an
    // upgrade and cannot forge it; non-browser clients send none.
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin && !this._allowedOrigins().has(origin)) {
      socket.destroy();
      return;
    }
    const socketPath = (req.url ?? '').split('?')[0];
    const auth = socketPath === '/v1/events'
      ? this._checkSocketAuth(req)
      : { ok: false as const, protocol: undefined };
    if (!auth.ok) {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const protocolHeader = auth.protocol ? `Sec-WebSocket-Protocol: ${auth.protocol}\r\n` : '';
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + protocolHeader + 'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    this._eventSockets.add(socket);
    socket.on('close', () => this._eventSockets.delete(socket));
    socket.on('error', () => { this._eventSockets.delete(socket); socket.destroy(); });
  }

  /**
   * Effective CORS allowlist: the configured origins plus the loopback origins
   * the server itself is reachable on (so a browser app on the same host:port
   * always works). Only a request Origin present in this set is reflected.
   */
  private _allowedOrigins(): Set<string> {
    const list = new Set<string>(this._cfg.allowedOrigins ?? []);
    const { host, port } = this._cfg;
    for (const h of new Set([host, 'localhost', '127.0.0.1', '[::1]'])) {
      list.add(`http://${h}`);
      list.add(`http://${h}:${port}`);
    }
    return list;
  }

  /**
   * Bearer-token auth check. Returns true when auth is disabled (no token
   * configured) or when the request carries the correct 'Authorization: Bearer
   * <token>' header. The token comparison is constant-time.
   */
  private _checkAuth(req: IncomingMessage): boolean {
    const token = String(this._cfg.authToken ?? '');
    const externallyBound = !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(this._cfg.host);
    if (!token) return !externallyBound;
    const header = req.headers.authorization ?? '';
    // Parse 'Bearer <token>' with plain string ops (no regex) to avoid any
    // backtracking on attacker-controlled header values.
    const sp = header.indexOf(' ');
    if (sp === -1) return false;
    if (header.slice(0, sp).toLowerCase() !== 'bearer') return false;
    const provided = header.slice(sp + 1).trim();
    if (!provided) return false;
    return safeEqual(provided, token);
  }

  /** Reject state-changing requests from origins outside the CORS allowlist. */
  private _isCrossSite(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin && origin !== 'null') {
      return !this._allowedOrigins().has(origin);
    }
    return String(req.headers['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site';
  }

  private _limit(req: IncomingMessage, res: ServerResponse): boolean {
    const limits = this._cfg.rateLimit ?? { perMinute: 60, maxConcurrent: 16 };
    const lease = this._limiter.acquire(req.socket.remoteAddress ?? 'local', limits.perMinute, limits.maxConcurrent);
    if (!lease.ok) {
      json(res, 429, { error: { message: lease.reason, type: 'rate_limit_error' } });
      return false;
    }
    res.once('close', lease.release);
    return true;
  }

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const path = url.split('?')[0];
    const method = req.method ?? 'GET';

    // CORS: reflect the request Origin only when it is in the allowlist.
    // Requests with no Origin header (curl, server-side OpenAI clients) are
    // unaffected and continue to work.
    const origin = req.headers.origin;
    if (origin && this._allowedOrigins().has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── GET /health ──────────────────────────────────────────────────────────
    // Always open (no auth) so health checks keep working.
    if (path === '/health' && method === 'GET') {
      json(res, 200, { status: 'ok', service: 'conduit-bridge', version: PKG_VERSION });
      return;
    }

    // HTML is public on loopback so the page can collect a bearer token; /v1/* stays gated.
    if ((path === '/' || path === '/dashboard' || path === '/help') && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(path === '/help' ? HELP_HTML : DASHBOARD_HTML);
      return;
    }

    // A foreign page must not be able to store a credential, start a browser or
    // change configuration just because the bridge is reachable on loopback.
    if (method !== 'GET' && method !== 'HEAD' && this._isCrossSite(req)) {
      json(res, 403, { error: { message: 'Cross-site requests are not accepted for this endpoint.', type: 'forbidden' } });
      return;
    }

    // ── Optional bearer-token auth ─────────────────────────────────────────────
    // When BridgeConfig.authToken is set, every endpoint below requires a
    // matching 'Authorization: Bearer <token>' header. When unset (default),
    // the server behaves exactly as before (no auth).
    if (!this._checkAuth(req)) {
      json(res, 401, { error: { message: 'Unauthorized: valid bearer token required', type: 'invalid_request' } });
      return;
    }

    // ── GET /v1/models ───────────────────────────────────────────────────────
    if (path === '/v1/models' && method === 'GET') {
      const models = this._registry.allModels().map(m => ({
        id: m.id,
        object: 'model',
        created: 0,
        owned_by: m.owned_by,
        conduit: { availability: m.availability ?? 'dynamic', source: m.source ?? 'provider' },
      }));
      json(res, 200, { object: 'list', data: models });
      return;
    }

    if (path === '/v1/models/refresh' && method === 'POST') {
      const refreshed = await this._registry.refreshApiModels();
      this._activity.add('success', 'models', 'Provider model catalogs refreshed');
      json(res, 200, { object: 'conduit.model_refresh', refreshed });
      return;
    }

    // ── GET /v1/status ───────────────────────────────────────────────────────
    if (path === '/v1/status' && method === 'GET') {
      const status = await this._registry.getStatus();
      json(res, 200, status);
      return;
    }

    if (path === '/v1/metrics' && method === 'GET') {
      json(res, 200, { object: 'conduit.metrics', generated_at: Date.now(), models: this._metrics.snapshot() });
      return;
    }

    if (path === '/v1/activity' && method === 'GET') {
      json(res, 200, { object: 'conduit.activity', events: this._activity.snapshot() });
      return;
    }

    if (path === '/v1/orchestrator' && method === 'GET') {
      json(res, 200, this._orchestrator);
      return;
    }

    if (path === '/v1/orchestrator/history' && method === 'GET') {
      json(res, 200, { object: 'conduit.orchestrator_history', runs: this._runHistory.snapshot() });
      return;
    }

    if (path === '/v1/compare' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (typeof data?.prompt !== 'string' || !data.prompt.trim() || !Array.isArray(data.models) || !data.models.length) {
        json(res, 400, { error: { message: 'prompt and models are required', type: 'invalid_request' } }); return;
      }
      if (!this._limit(req, res)) return;
      const controller = new AbortController();
      req.once('aborted', () => controller.abort());
      const models = data.models.filter((model: any) => typeof model === 'string').slice(0, 8);
      const run = async (model: string) => {
        const started = Date.now();
        const provider = this._registry.providerForModel(model);
        if (!provider || !(await provider.ensureConnected())) return { model, ok: false, latencyMs: Date.now() - started, error: 'provider unavailable' };
        const finish = this._metrics.begin(model);
        try {
          const content = await provider.chat({ model, messages: [{ role: 'user', content: data.prompt }], effort: data.effort, max_tokens: typeof data.max_tokens === 'number' ? Math.min(Math.max(1, data.max_tokens), 4096) : 256, signal: controller.signal });
          finish();
          this._metrics.recordUsage(model, estimateTokens([{ content: data.prompt }]), estimateTokens([{ content }]), estimateCost(model, estimateTokens([{ content: data.prompt }]), estimateTokens([{ content }])));
          return { model, ok: true, latencyMs: Date.now() - started, content };
        } catch (err) {
          finish(err);
          return { model, ok: false, latencyMs: Date.now() - started, error: (err as Error).message.slice(0, 240) };
        }
      };
      const results = await Promise.all(models.map(run));
      json(res, 200, { object: 'conduit.comparison', prompt_hash: createHash('sha256').update(data.prompt).digest('hex').slice(0, 16), results });
      return;
    }

    if (path === '/v1/orchestrator' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const strategies = new Set<OrchestrationStrategy>(['sequential', 'parallel', 'debate']);
      const roles = Array.isArray(data?.roles) ? data.roles.filter((r: any) => typeof r?.name === 'string' && typeof r?.model === 'string').slice(0, 8).map((r: any) => ({ name: r.name.trim().slice(0, 60), model: r.model.trim().slice(0, 180) })) : this._orchestrator.roles;
      this._orchestrator = { enabled: Boolean(data?.enabled), strategy: strategies.has(data?.strategy) ? data.strategy : 'sequential', roles, fallbackModels: Array.isArray(data?.fallbackModels) ? data.fallbackModels.filter((m: any) => typeof m === 'string').slice(0, 8) : [] };
      saveConfig({ orchestrator: this._orchestrator });
      this._activity.add('success', 'orchestrator', 'Orchestrator configuration updated');
      json(res, 200, this._orchestrator);
      return;
    }

    if (path === '/v1/orchestrator/run' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (!this._orchestrator.enabled) { json(res, 400, { error: { message: 'Orchestrator is disabled', type: 'invalid_request' } }); return; }
      if (typeof data?.prompt !== 'string' || !data.prompt.trim()) { json(res, 400, { error: { message: 'prompt is required', type: 'invalid_request' } }); return; }
      const roles = this._orchestrator.roles.filter(r => r.model);
      if (!roles.length) { json(res, 400, { error: { message: 'Configure at least one role model', type: 'invalid_request' } }); return; }
      if (!this._limit(req, res)) return;
      this._activity.add('info', 'orchestrator', 'Run started with ' + this._orchestrator.strategy + ' strategy');
      const runRole = async (role: { name: string; model: string }, prompt: string) => {
        const candidates = [role.model, ...this._orchestrator.fallbackModels].filter((model, i, all) => model && all.indexOf(model) === i);
        let lastError: unknown = new Error(role.name + ': no usable model');
        for (const model of candidates) {
          try {
            const provider = this._registry.providerForModel(model);
            if (!provider || !(await provider.ensureConnected())) throw new Error('model is unavailable');
            this._activity.add('info', 'orchestrator', role.name + ' started on ' + model);
            const content = await provider.chat({ model, messages: [{ role: 'user', content: prompt }], effort: data.effort });
            this._activity.add('success', 'orchestrator', role.name + ' completed on ' + model);
            return { role: role.name, model, content };
          } catch (err) {
            lastError = err;
            this._activity.add('warning', 'orchestrator', role.name + ' failed on ' + model + ', trying fallback');
          }
        }
        throw new Error(role.name + ': ' + (lastError as Error).message);
      };
      const debatePrompt = (index: number, prior: Array<{ role: string; model: string; content: string }>): string => {
        if (!prior.length) return data.prompt;
        const transcript = prior.map(r => r.role + ' (' + r.model + '):\n' + r.content).join('\n\n');
        const isLast = index === roles.length - 1;
        return isLast
          ? 'Original task:\n' + data.prompt + '\n\nPrior answers:\n' + transcript + '\n\nCritique the prior answers and produce a final synthesis.'
          : 'Original task:\n' + data.prompt + '\n\nPrior answers:\n' + transcript + '\n\nGive your own answer, taking the prior answers into account.';
      };
      try {
        const ordered: Array<{ role: string; model: string; content: string }> = [];
        if (this._orchestrator.strategy === 'parallel') {
          ordered.push(...await Promise.all(roles.map(role => runRole(role, data.prompt))));
        } else if (this._orchestrator.strategy === 'debate') {
          for (let i = 0; i < roles.length; i++) {
            ordered.push(await runRole(roles[i], debatePrompt(i, ordered)));
          }
        } else {
          for (const role of roles) ordered.push(await runRole(role, data.prompt));
        }
        const run = this._runHistory.add(this._orchestrator.strategy, data.prompt, ordered, Date.now());
        json(res, 200, { id: run.id, strategy: this._orchestrator.strategy, results: ordered, completed_at: run.completedAt });
      } catch (err) {
        this._activity.add('error', 'orchestrator', 'Run failed: ' + (err as Error).message);
        json(res, 503, { error: { message: (err as Error).message, type: 'orchestrator_error' } });
      }
      return;
    }

    if (path === '/v1/tests/cli' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (!this._limit(req, res)) return;
      const cliProviders = [...CLI_PROVIDERS];
      if (typeof data?.provider === 'string') {
        const provider = this._registry.lookup(data.provider);
        if (!provider || !CLI_PROVIDERS.has(data.provider as ProviderName)) {
          json(res, 404, { error: { message: `Unknown CLI provider: ${data.provider}`, type: 'not_found' } });
          return;
        }
      }
      const requested = typeof data?.provider === 'string' ? [data.provider] : cliProviders;
      const results = [];
      for (const providerName of requested) {
        const provider = this._registry.lookup(providerName);
        if (!provider) {
          results.push({ provider: providerName, model: undefined, ok: false, latencyMs: 0, error: 'unknown provider' });
          continue;
        }
        const model = provider.models.find(m => m.id.startsWith('cli-'))?.id;
        const started = Date.now();
        try {
          if (!model || !(await provider.ensureConnected())) throw new Error('provider is not connected');
          const content = await provider.chat({ model, messages: [{ role: 'user', content: 'Reply with exactly: pong' }], max_tokens: 16 });
          const ok = content.trim().toLowerCase().includes('pong');
          results.push({ provider: providerName, model, ok, latencyMs: Date.now() - started, output: content.slice(0, 160) });
          this._activity.add(ok ? 'success' : 'warning', 'cli-test', providerName + (ok ? ' passed ping-pong' : ' returned an unexpected response'));
        } catch (err) {
          results.push({ provider: providerName, model, ok: false, latencyMs: Date.now() - started, error: (err as Error).message.slice(0, 240) });
          this._activity.add('error', 'cli-test', providerName + ' failed: ' + (err as Error).message.slice(0, 200));
        }
      }
      json(res, 200, { object: 'conduit.cli_test', results });
      return;
    }

    if (path === '/v1/responses' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const input = typeof data?.input === 'string' ? data.input : Array.isArray(data?.input) ? data.input : '';
      if (!data?.model || !input) { json(res, 400, { error: { message: 'model and input required', type: 'invalid_request' } }); return; }
      const messages = typeof input === 'string' ? [{ role: 'user' as const, content: input }] : input;
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once('aborted', abort);
      res.once('close', () => { if (!res.writableEnded) abort(); });
      const provider = this._registry.providerForModel(data.model);
      if (!provider || !(await provider.ensureConnected())) { json(res, 503, { error: { message: 'Response provider is unavailable', type: 'provider_unavailable' } }); return; }
      try {
        const content = await provider.chat({ model: data.model, messages, effort: data.reasoning?.effort || data.reasoning_effort, max_tokens: data.max_output_tokens, signal: controller.signal });
        json(res, 200, { id: 'resp-' + Date.now(), object: 'response', model: data.model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] }], status: 'completed' });
      } catch (err) {
        json(res, 503, { error: { message: (err as Error).message, type: 'provider_error' } });
      }
      return;
    }

    if (path === '/v1/embeddings' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (!data?.model || (!data.input && data.input !== '')) { json(res, 400, { error: { message: 'model and input required', type: 'invalid_request' } }); return; }
      const provider = this._registry.providerForModel(data.model);
      if (!provider || !/^api-(codex|openrouter)\//.test(data.model) || !('embeddings' in provider) || !(await provider.ensureConnected())) { json(res, 501, { error: { message: 'Embeddings require a connected codex-api or openrouter-api provider', type: 'not_implemented' } }); return; }
      try {
        const apiModel = data.model.replace(/^api-(?:codex|openrouter)\//, '');
        const result = await (provider as any).embeddings(data.input, apiModel);
        json(res, 200, { object: 'list', data: result.data, model: data.model, usage: result.usage || { prompt_tokens: 0, total_tokens: 0 } });
      } catch (err) {
        json(res, 503, { error: { message: (err as Error).message, type: 'provider_error' } });
      }
      return;
    }

    if (path === '/v1/settings' && method === 'GET') {
      const status = await this._registry.getStatus();
      const apiProviders = ['claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api'];
      json(res, 200, {
        apiKeys: Object.fromEntries(apiProviders.map(name => {
          const configured = Boolean(this._cfg.apiKeys[name as keyof typeof this._cfg.apiKeys]);
          const connected = Boolean(status.providers.find(p => p.name === name)?.connected);
          const adapter = this._registry.get(name as import('./types.js').ProviderName);
          return [name, { configured, connected, source: adapter.credentialSource ?? (configured ? 'Bridge config' : 'Not detected') }];
        })),
      });
      return;
    }

    if (path === '/v1/settings/api-key' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const allowed = new Set(['claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api']);
      if (!allowed.has(data?.provider) || typeof data?.key !== 'string' || data.key.trim().length < 8) {
        json(res, 400, { error: { message: 'provider and a valid key are required', type: 'invalid_request' } });
        return;
      }
      const provider = data.provider as 'claude-api' | 'gemini-api' | 'codex-api' | 'openrouter-api' | 'perplexity-api';
      this._cfg.apiKeys[provider] = data.key.trim();
      saveConfig({ apiKeys: { ...this._cfg.apiKeys } });
      // API providers cache credential discovery. Re-resolve immediately so
      // the Provider card becomes ready without requiring a bridge restart.
      const connected = await this._registry.get(provider).ensureConnected();
      this._activity.add('success', 'settings', provider + ' API credential saved');
      json(res, 200, { status: 'saved', provider, configured: true, connected });
      return;
    }

    if (path === '/v1/capabilities' && method === 'GET') {
      const providers = this._registry.allModels().reduce<Record<string, ReturnType<typeof effortCapabilities>>>((out, model) => {
        out[model.provider] ??= effortCapabilities(model.provider);
        return out;
      }, {});
      json(res, 200, { effort: providers });
      return;
    }

    // ── POST /v1/chat/completions ────────────────────────────────────────────
    if (path === '/v1/chat/completions' && method === 'POST') {
      const body = await readBody(req);
      let req_data: any;
      try {
        req_data = JSON.parse(body);
      } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }

      const { model, messages, stream = false, temperature, max_tokens } = req_data;
      const requestAbort = new AbortController();
      const abortRequest = () => {
        if (!res.writableEnded) this._activity.add('warning', 'request', 'Client disconnected, cancelling ' + model);
        requestAbort.abort();
      };
      req.once('aborted', abortRequest);
      res.once('close', () => {
        if (!res.writableEnded) abortRequest();
      });
      // Accept either effort or OpenAI-style reasoning_effort
      const effort = pickEffort(req_data);
      if (!model || !messages) {
        json(res, 400, { error: { message: 'model and messages required', type: 'invalid_request' } });
        return;
      }
      const parsedMode = parseCliRunMode(req_data);
      if (!parsedMode.ok) {
        json(res, 400, { error: { message: parsedMode.error, type: 'invalid_request' } });
        return;
      }
      const cwd = typeof req_data.cwd === 'string' ? req_data.cwd : undefined;
      const cwdError = agentModeCwdError(parsedMode.mode, cwd);
      if (cwdError) {
        json(res, 400, { error: { message: cwdError, type: 'invalid_request' } });
        return;
      }

      if (!this._limit(req, res)) return;

      let selectedModel = model;
      let provider = this._registry.providerForModel(selectedModel);
      if (!provider) {
        json(res, 404, { error: { message: `Unknown model: ${model}`, type: 'invalid_request' } });
        return;
      }

      // Resolve the selected API credential or local CLI/process state.
      const candidates = [model, ...(Array.isArray(req_data.fallback_models) ? req_data.fallback_models : []), ...this._orchestrator.fallbackModels];
      let connected = candidates.length > 1 ? await provider.checkSession() : await provider.ensureConnected();
      for (const candidate of candidates) {
        if (connected) break;
        const fallback = this._registry.providerForModel(candidate);
        if (!fallback) continue;
        const fallbackConnected = candidates.indexOf(candidate) < candidates.length - 1 ? await fallback.checkSession() : await fallback.ensureConnected();
        if (fallbackConnected) {
          selectedModel = candidate;
          provider = fallback;
          connected = true;
          this._activity.add('warning', 'router', 'Fallback selected: ' + candidate);
        }
      }
      if (!connected) {
        this._activity.add('warning', provider.name, 'Request blocked because provider is not connected');
        json(res, 503, { error: { message: `${provider.name} is not connected. Configure its API credential or authenticate the local CLI.`, type: 'provider_unavailable' } });
        return;
      }

      const chatReq = { model: selectedModel, messages, temperature, max_tokens, effort, cwd, mode: parsedMode.mode, signal: requestAbort.signal };
      const finishMetric = this._metrics.begin(selectedModel);

      if (stream) {
        let streamIterator: AsyncGenerator<string> = provider.chatStream(chatReq);
        let firstChunk: IteratorResult<string> = { done: true, value: undefined };
        try {
          firstChunk = await streamIterator.next();
        } catch (primaryError) {
          finishMetric(primaryError);
          let recovered = false;
          for (const candidate of candidates.slice(1)) {
            const fallback = this._registry.providerForModel(candidate);
            if (!fallback || !(await fallback.checkSession())) continue;
            const fallbackFinish = this._metrics.begin(candidate);
            try {
              streamIterator = fallback.chatStream({ ...chatReq, model: candidate });
              firstChunk = await streamIterator.next();
              fallbackFinish();
              selectedModel = candidate;
              provider = fallback;
              recovered = true;
              this._activity.add('warning', 'router', 'Streaming primary failed, fallback selected: ' + candidate);
              break;
            } catch (fallbackError) {
              fallbackFinish(fallbackError);
            }
          }
          if (!recovered) {
            json(res, 503, { error: { message: (primaryError as Error).message, type: 'provider_error' } });
            return;
          }
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const id = `chatcmpl-${Date.now()}`;
        let streamedText = firstChunk.done ? '' : (firstChunk.value ?? '');
        try {
          if (!firstChunk.done && firstChunk.value) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: selectedModel, choices: [{ index: 0, delta: { content: firstChunk.value }, finish_reason: null }] })}\n\n`);
          for await (const chunk of streamIterator) {
            streamedText += chunk;
            // Include provider metadata if available (thinking status, tokens, timing)
            const meta = 'currentMeta' in provider ? (provider as any).currentMeta : undefined;
            const data = JSON.stringify({
              id, object: 'chat.completion.chunk', model: selectedModel,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
              ...(meta ? { conduit_meta: meta } : {}),
            });
            res.write(`data: ${data}\n\n`);
          }
          // Send final metadata with done signal
          const finalMeta = 'currentMeta' in provider ? (provider as any).currentMeta : undefined;
          const doneData = JSON.stringify({
            id, object: 'chat.completion.chunk', model: selectedModel,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            ...(finalMeta ? { conduit_meta: finalMeta } : {}),
          });
          res.write(`data: ${doneData}\n\n`);
          res.write('data: [DONE]\n\n');
          const inputTokens = estimateTokens(messages);
          const outputTokens = estimateTokens([{ content: streamedText }]);
          this._metrics.recordUsage(selectedModel, inputTokens, outputTokens, estimateCost(selectedModel, inputTokens, outputTokens));
        } catch (err) {
          finishMetric(err);
          this._activity.add('error', provider.name, 'Streaming request failed through ' + model + ': ' + (err as Error).message.replace(/\s+/g, ' ').slice(0, 240));
          const errData = JSON.stringify({ error: (err as Error).message });
          res.write(`data: ${errData}\n\n`);
        }
        if (!res.writableEnded) {
          finishMetric();
        }
        res.end();
      } else {
        try {
          let content = '';
          try {
            content = await provider.chat(chatReq);
          } catch (primaryError) {
            finishMetric(primaryError);
            let recovered = false;
            for (const candidate of candidates.slice(1)) {
              const fallback = this._registry.providerForModel(candidate);
              if (!fallback || !(await fallback.checkSession())) continue;
              const fallbackFinish = this._metrics.begin(candidate);
              try {
                content = await fallback.chat({ ...chatReq, model: candidate });
                fallbackFinish();
                selectedModel = candidate;
                provider = fallback;
                recovered = true;
                this._activity.add('warning', 'router', 'Primary request failed, fallback completed through ' + candidate);
                break;
              } catch (fallbackError) {
                fallbackFinish(fallbackError);
                this._activity.add('warning', 'router', 'Fallback failed through ' + candidate);
              }
            }
            if (!recovered) throw primaryError;
          }
          const inputTokens = estimateTokens(messages);
          const outputTokens = estimateTokens([{ content }]);
          this._metrics.recordUsage(selectedModel, inputTokens, outputTokens, estimateCost(selectedModel, inputTokens, outputTokens));
          finishMetric();
          this._activity.add('success', provider.name, 'Completed request through ' + selectedModel);
          json(res, 200, {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            model: selectedModel,
            choices: [{
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
          });
        } catch (err) {
          finishMetric(err);
          this._activity.add('error', provider.name, 'Request failed through ' + selectedModel + ': ' + (err as Error).message.replace(/\s+/g, ' ').slice(0, 240));
          json(res, 503, { error: { message: (err as Error).message, type: 'provider_error' } });
        }
      }
      return;
    }

    // 404
    json(res, 404, { error: { message: `Not found: ${url}`, type: 'not_found' } });
  }
}

/** Constant-time string comparison (avoids leaking the token via timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function json(res: ServerResponse, status: number, body: object) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

/** Encode one server-to-client WebSocket text frame. Client input is ignored. */
function websocketFrame(payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8');
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65_536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function estimateTokens(messages: Array<{ content: string }>): number {
  return Math.max(1, Math.ceil(messages.reduce((n, message) => n + message.content.length, 0) / 4));
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = model.includes('haiku') || model.includes('flash') || model.includes('luna') ? 0.000001 : model.includes('opus') || model.includes('sol') ? 0.000015 : 0.000005;
  return Number(((inputTokens + outputTokens) * rate).toFixed(8));
}
