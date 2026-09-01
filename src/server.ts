import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { BridgeConfig } from './types.js';
import { ProviderRegistry } from './registry.js';
import { logger } from './logger.js';
import { effortCapabilities, pickEffort } from './effort.js';
import { DASHBOARD_HTML, HELP_HTML } from './dashboard.js';
import { MetricsStore } from './metrics.js';
import { saveConfig } from './config.js';
import { ActivityLog } from './activity.js';
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig, type OrchestrationStrategy } from './orchestrator.js';
import { RequestLimiter } from './limits.js';
import { RunHistory } from './run-history.js';
import { LoginSessionManager, DuplicateLoginError } from './login/session-manager.js';
import { probeDisplay } from './login/display.js';
import { loginViewerUrl, serveLoginViewer, validateLoginViewerInput } from './login/viewer.js';
import type { LoginSnapshot, LoginState } from './login/state.js';
import { assertSupportedPlatform } from './platform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

/**
 * Every provider name the HTTP routes accept. Kept in one place so the login,
 * logout and login-sub-routes cannot drift apart.
 */
const PROVIDER_NAMES = [
  'grok', 'claude', 'gemini', 'chatgpt', 'perplexity',
  'claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api',
  'lmstudio', 'grok-cli', 'cli-codex', 'cli-claude', 'cli-gemini',
] as const;
const PROVIDER_PATTERN = PROVIDER_NAMES.join('|');

/** The providers that authenticate through a visible browser. */
const WEB_LOGIN_PROVIDERS = new Set<string>(['grok', 'claude', 'gemini', 'chatgpt', 'perplexity']);
const LOGIN_FAILURE_STATES = new Set<LoginState>(['blocked', 'timeout', 'failed', 'cancelled']);

export class BridgeServer {
  private _registry: ProviderRegistry;
  private _server: ReturnType<typeof createServer> | null = null;
  private _cfg: BridgeConfig;
  private _keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private _metrics = new MetricsStore();
  private _activity = new ActivityLog();
  private _orchestrator: OrchestratorConfig = structuredClone(DEFAULT_ORCHESTRATOR);
  private _limiter = new RequestLimiter();
  private _runHistory = new RunHistory();
  private _eventSockets = new Set<Duplex>();
  private _unsubscribeActivity: (() => void) | null = null;
  private _logins: LoginSessionManager;

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
    this._registry = new ProviderRegistry(cfg);
    this._orchestrator = structuredClone(cfg.orchestrator ?? DEFAULT_ORCHESTRATOR);
    // Built here rather than as a field initializer: field initializers run
    // before `this._cfg` is assigned, which silently dropped the configured
    // login timings and mode.
    this._logins = new LoginSessionManager({
      timings: cfg.login?.timings,
      mode: cfg.login?.mode,
      // Login progress is pushed to connected dashboards. It deliberately does
      // NOT write an activity entry per transition: every activity event makes
      // each dashboard refetch the whole status surface, which would hammer the
      // very provider that is mid-login.
      onTransition: snapshot => this._broadcast({ type: 'login', login: snapshot }),
    });
  }

  get registry(): ProviderRegistry {
    return this._registry;
  }

  async start(): Promise<void> {
    assertSupportedPlatform();
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

    // Restore sessions after server is up (non-blocking)
    setTimeout(() => {
      this._registry.restoreSessions().catch(err =>
        logger.warn(`Session restore error: ${err.message}`),
      );
      this._registry.refreshApiModels().catch(err => logger.warn(`Model catalog refresh error: ${err.message}`));
    }, 3000);

    // Session keepalive: every 5 minutes, check and reconnect stale providers
    this._keepaliveTimer = setInterval(() => {
      this._registry.keepaliveSessions().catch(err =>
        logger.warn(`Session keepalive error: ${err.message}`),
      );
    }, 5 * 60 * 1000);
  }

  async stop(): Promise<void> {
    // Cancel in-flight logins first so no visible browser is left running and
    // no profile directory stays locked.
    await this._logins.stopAll().catch(() => {});
    if (this._keepaliveTimer) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = null;
    }
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

  /**
   * Returns the attempt that still describes the provider's current state.
   * A valid provider session makes an older failure or cancellation obsolete.
   */
  private _reconciledLoginSnapshot(
    provider: import('./types.js').ProviderName,
    sessionValid: boolean,
  ): LoginSnapshot | undefined {
    const login = this._logins.snapshot(provider);
    if (!login || !sessionValid || !LOGIN_FAILURE_STATES.has(login.state)) return login;
    this._logins.forgetFinished(provider, login.sessionId);
    return undefined;
  }

  /** Attach the latest relevant login snapshot to each provider status. */
  private _withLoginState(status: import('./types.js').BridgeStatus): import('./types.js').BridgeStatus {
    return {
      ...status,
      providers: status.providers.map(p => {
        const login = this._reconciledLoginSnapshot(p.name, p.sessionValid);
        return login ? { ...p, login } : p;
      }),
    };
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

  /**
   * Auth for the event socket.
   *
   * A browser WebSocket cannot set an Authorization header, so when a token is
   * configured the dashboard passes it as the 'conduit-token.<token>'
   * sub-protocol (preferred — sub-protocols are not written to access logs the
   * way query strings are) or as ?token=. The header form still works for
   * non-browser clients.
   */
  private _checkSocketAuth(req: IncomingMessage): { ok: boolean; protocol?: string } {
    if (this._checkAuth(req)) return { ok: true };
    const token = this._cfg.authToken ?? '';
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
    // login diagnostics and activity. A browser always sends Origin on an
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
    const token = this._cfg.authToken ?? '';
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

  /**
   * Reject a state-changing request that a foreign web page made on the
   * person's behalf.
   *
   * A cross-origin POST with a text/plain body is a "simple request": it is
   * sent without a preflight, and CORS only hides the response. That is no
   * comfort for a request whose side effect is storing an API key or opening a
   * browser, so those are gated on provenance instead.
   *
   * Requests with no Origin and no Sec-Fetch-Site (curl, an SDK, a script) are
   * unaffected — a web page cannot suppress those headers.
   */
  private _isCrossSite(req: IncomingMessage): boolean {
    const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
    if (site) return site === 'cross-site' || site === 'same-site';
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin && origin !== 'null') {
      return !this._allowedOrigins().has(origin);
    }
    return false;
  }

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    // Routes below match on the path only; `url` keeps the query string for
    // the handful of endpoints that read it.
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
    if (url === '/health' && method === 'GET') {
      json(res, 200, { status: 'ok', service: 'conduit-bridge', version: PKG_VERSION });
      return;
    }

    // Serve the local dashboard from the same origin as the API.
    if ((url === '/' || url === '/dashboard' || url === '/help') && method === 'GET') {
      if (!this._checkAuth(req)) {
        json(res, 401, { error: { message: 'Unauthorized: valid bearer token required', type: 'invalid_request' } });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(url === '/help' ? HELP_HTML : DASHBOARD_HTML);
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

    // The built-in login viewer uses the same authenticated port as the API.
    // It exposes page frames and a narrow input vocabulary, never raw CDP.
    const viewerMatch = path.match(new RegExp(`^/v1/login/(${[...WEB_LOGIN_PROVIDERS].join('|')})/viewer$`));
    if (viewerMatch && (method === 'GET' || method === 'HEAD')) {
      serveLoginViewer(req, res);
      return;
    }

    const frameMatch = path.match(new RegExp(`^/v1/login/(${[...WEB_LOGIN_PROVIDERS].join('|')})/frame$`));
    if (frameMatch && method === 'GET') {
      const provider = this._registry.get(frameMatch[1] as import('./types.js').ProviderName);
      const frame = typeof provider.captureLoginFrame === 'function'
        ? await provider.captureLoginFrame()
        : null;
      if (!frame) {
        json(res, 409, { error: { message: 'The login browser is not ready.', type: 'login_browser_unavailable' } });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': frame.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(frame);
      return;
    }

    const inputMatch = path.match(new RegExp(`^/v1/login/(${[...WEB_LOGIN_PROVIDERS].join('|')})/input$`));
    if (inputMatch && method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      const input = validateLoginViewerInput(body);
      if (!input) {
        json(res, 400, { error: { message: 'Invalid login viewer input', type: 'invalid_request' } });
        return;
      }
      const provider = this._registry.get(inputMatch[1] as import('./types.js').ProviderName);
      const accepted = typeof provider.dispatchLoginInput === 'function'
        ? await provider.dispatchLoginInput(input).catch(() => false)
        : false;
      if (!accepted) {
        json(res, 409, { error: { message: 'The login browser is not ready.', type: 'login_browser_unavailable' } });
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    // ── GET /v1/models ───────────────────────────────────────────────────────
    if (url === '/v1/models' && method === 'GET') {
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

    if (url === '/v1/models/refresh' && method === 'POST') {
      const refreshed = await this._registry.refreshApiModels();
      this._activity.add('success', 'models', 'Provider model catalogs refreshed');
      json(res, 200, { object: 'conduit.model_refresh', refreshed });
      return;
    }

    // ── GET /v1/status ───────────────────────────────────────────────────────
    if (url === '/v1/status' && method === 'GET') {
      const status = await this._registry.getStatus();
      json(res, 200, this._withLoginState(status));
      return;
    }

    if (url === '/v1/metrics' && method === 'GET') {
      json(res, 200, { object: 'conduit.metrics', generated_at: Date.now(), models: this._metrics.snapshot() });
      return;
    }

    if (url === '/v1/activity' && method === 'GET') {
      json(res, 200, { object: 'conduit.activity', events: this._activity.snapshot() });
      return;
    }

    if (url === '/v1/orchestrator' && method === 'GET') {
      json(res, 200, this._orchestrator);
      return;
    }

    if (url === '/v1/orchestrator/history' && method === 'GET') {
      json(res, 200, { object: 'conduit.orchestrator_history', runs: this._runHistory.snapshot() });
      return;
    }

    if (url === '/v1/compare' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (typeof data?.prompt !== 'string' || !data.prompt.trim() || !Array.isArray(data.models) || !data.models.length) {
        json(res, 400, { error: { message: 'prompt and models are required', type: 'invalid_request' } }); return;
      }
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

    if (url === '/v1/orchestrator' && method === 'POST') {
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

    if (url === '/v1/orchestrator/run' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (!this._orchestrator.enabled) { json(res, 400, { error: { message: 'Orchestrator is disabled', type: 'invalid_request' } }); return; }
      if (typeof data?.prompt !== 'string' || !data.prompt.trim()) { json(res, 400, { error: { message: 'prompt is required', type: 'invalid_request' } }); return; }
      const roles = this._orchestrator.roles.filter(r => r.model);
      if (!roles.length) { json(res, 400, { error: { message: 'Configure at least one role model', type: 'invalid_request' } }); return; }
      this._activity.add('info', 'orchestrator', 'Run started with ' + this._orchestrator.strategy + ' strategy');
      const runRole = async (role: { name: string; model: string }) => {
        const candidates = [role.model, ...this._orchestrator.fallbackModels].filter((model, i, all) => model && all.indexOf(model) === i);
        let lastError: unknown = new Error(role.name + ': no usable model');
        for (const model of candidates) {
          try {
            const provider = this._registry.providerForModel(model);
            if (!provider || !(await provider.ensureConnected())) throw new Error('model is unavailable');
            this._activity.add('info', 'orchestrator', role.name + ' started on ' + model);
            const content = await provider.chat({ model, messages: [{ role: 'user', content: data.prompt }], effort: data.effort });
            this._activity.add('success', 'orchestrator', role.name + ' completed on ' + model);
            return { role: role.name, model, content };
          } catch (err) {
            lastError = err;
            this._activity.add('warning', 'orchestrator', role.name + ' failed on ' + model + ', trying fallback');
          }
        }
        throw new Error(role.name + ': ' + (lastError as Error).message);
      };
      try {
        const results = this._orchestrator.strategy === 'parallel' ? await Promise.all(roles.map(runRole)) : [];
        const ordered = this._orchestrator.strategy === 'parallel' ? results : [];
        if (this._orchestrator.strategy !== 'parallel') {
          for (const role of roles) ordered.push(await runRole(role));
        }
        const run = this._runHistory.add(this._orchestrator.strategy, data.prompt, ordered, Date.now());
        json(res, 200, { id: run.id, strategy: this._orchestrator.strategy, results: ordered, completed_at: run.completedAt });
      } catch (err) {
        this._activity.add('error', 'orchestrator', 'Run failed: ' + (err as Error).message.replace(/\s+/g, ' ').slice(0, 240));
        json(res, 503, { error: { message: (err as Error).message, type: 'orchestrator_error' } });
      }
      return;
    }

    if (url === '/v1/tests/cli' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const cliProviders = this._registry.allModels().filter(m => m.id.startsWith('cli-')).map(m => m.provider).filter((v, i, a) => a.indexOf(v) === i);
      const requested = typeof data?.provider === 'string' ? [data.provider] : cliProviders;
      const results = [];
      for (const providerName of requested) {
        const provider = this._registry.get(providerName as import('./types.js').ProviderName);
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

    if (url === '/v1/responses' && method === 'POST') {
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

    if (url === '/v1/embeddings' && method === 'POST') {
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

    if (url === '/v1/settings' && method === 'GET') {
      const status = await this._registry.getStatus();
      const apiProviders = ['claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api'];
      json(res, 200, {
        apiKeys: Object.fromEntries(apiProviders.map(name => {
          const configured = Boolean(this._cfg.apiKeys[name as keyof typeof this._cfg.apiKeys]);
          const connected = Boolean(status.providers.find(p => p.name === name)?.connected);
          return [name, { configured, connected, source: configured ? 'Bridge config' : connected ? 'Auto-detected CLI credentials' : 'Not detected' }];
        })),
        profiles: status.providers.filter(p => p.loginType === 'browser').map(p => ({ provider: p.name, hasProfile: p.hasProfile, connected: p.connected, status: p.session?.status ?? 'unknown', login: this._logins.snapshot(p.name) ?? null })),
        accounts: { 'cli-claude': ['first-account', 'second-account'] },
        paths: { profileBaseDir: this._cfg.profileBaseDir },
      });
      return;
    }

    if (url === '/v1/settings/api-key' && method === 'POST') {
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
      this._activity.add('success', 'settings', provider + ' API credential saved');
      json(res, 200, { status: 'saved', provider, configured: true });
      return;
    }

    if (url === '/v1/capabilities' && method === 'GET') {
      const providers = this._registry.allModels().reduce<Record<string, ReturnType<typeof effortCapabilities>>>((out, model) => {
        out[model.provider] ??= effortCapabilities(model.provider);
        return out;
      }, {});
      json(res, 200, { effort: providers });
      return;
    }

    // ── Interactive browser login ────────────────────────────────────────────
    // GET  /v1/login/:provider/status   current snapshot (never a credential)
    // POST /v1/login/:provider/cancel   stop the attempt and clean up
    // POST /v1/login/:provider/recheck  verify the saved profile now
    const loginSubMatch = path.match(new RegExp(`^/v1/login/(${PROVIDER_PATTERN})/(status|cancel|recheck)$`));
    if (loginSubMatch) {
      const name = loginSubMatch[1] as import('./types.js').ProviderName;
      const action = loginSubMatch[2];
      if (action === 'status' && method !== 'GET') { json(res, 405, { error: { message: 'Use GET for login status.', type: 'invalid_request' } }); return; }
      if (action !== 'status' && method !== 'POST') { json(res, 405, { error: { message: `Use POST for login ${action}.`, type: 'invalid_request' } }); return; }

      if (!WEB_LOGIN_PROVIDERS.has(name)) {
        json(res, 400, { status: 'error', provider: name, message: `${name} does not use browser login.` });
        return;
      }

      if (action === 'cancel') {
        const snapshot = await this._logins.cancel(name);
        if (snapshot) this._activity.add('info', name, 'Browser login cancelled');
        json(res, 200, { status: 'ok', provider: name, login: snapshot ?? null });
        return;
      }

      if (action === 'recheck') {
        const running = this._logins.recheck(name);
        if (running && this._logins.active(name)) {
          json(res, 202, { status: 'checking', provider: name, login: running, message: 'Checking the sign-in now.' });
          return;
        }
        // Nothing is running: verify the saved profile directly.
        const provider = this._registry.get(name);
        const restored = await provider.restoreSession().catch(() => false);
        const status = await this._registry.getStatus();
        const entry = status.providers.find(p => p.name === name);
        json(res, 200, {
          status: restored ? 'authenticated' : 'not_authenticated',
          provider: name,
          message: restored
            ? `${name} is signed in. The saved profile will be reused automatically.`
            : `${name} is not signed in yet. Start a browser login to complete it.`,
          login: this._reconciledLoginSnapshot(name, Boolean(entry?.sessionValid)) ?? null,
          session: entry?.session ?? null,
        });
        return;
      }

      // status
      const statusProvider = this._registry.get(name) as {
        profileDir?: string;
        sessionInfo?: { loggedIn: boolean };
      } | undefined;
      const snapshot = this._reconciledLoginSnapshot(name, Boolean(statusProvider?.sessionInfo?.loggedIn)) ?? null;
      const display = await probeDisplay(statusProvider?.profileDir);
      json(res, 200, {
        provider: name,
        active: this._logins.active(name),
        login: snapshot,
        viewer: {
          available: this._logins.active(name),
          url: display.ok ? loginViewerUrl(name) : null,
        },
        environment: {
          ready: display.ok,
          reason: display.reason,
          graphicalSession: Boolean(display.display || display.wayland),
          windowManager: display.windowManager,
          liveStatus: display.windowToolsAvailable,
          warnings: display.warnings,
        },
      });
      return;
    }

    // ── POST /v1/login/:provider ─────────────────────────────────────────────
    const loginMatch = path.match(new RegExp(`^/v1/login/(${PROVIDER_PATTERN})$`));
    if (loginMatch && method === 'POST') {
      const name = loginMatch[1] as import('./types.js').ProviderName;
      const provider = this._registry.get(name);

      // Only the web providers use browser login; everyone else gets guidance.
      if (!WEB_LOGIN_PROVIDERS.has(name)) {
        const CLI_HINTS: Record<string, string> = {
          lmstudio: `lmstudio needs no login - start LM Studio's local server and set LM_STUDIO_URL if it isn't on http://127.0.0.1:1234.`,
          'grok-cli': `grok-cli uses the local Grok CLI - install it and run \`grok login\` (not a browser login).`,
          'cli-codex': `cli-codex uses @openai/codex - npm i -g @openai/codex && codex login.`,
          'cli-claude': `cli-claude uses @anthropic-ai/claude-code - npm i -g @anthropic-ai/claude-code and authenticate.`,
          'cli-gemini': `cli-gemini uses the Antigravity CLI binary \`agy\` - install from antigravity.google and authenticate there.`,
        };
        const message = name.endsWith('-api')
          ? `${name} uses an API credential, not browser login. Add it through the dashboard's write-only Settings form or a protected environment variable.`
          : CLI_HINTS[name] ?? `${name} does not use browser login.`;
        json(res, 400, { status: 'error', provider: name, message });
        return;
      }

      // One attempt at a time per provider: a second visible browser cannot
      // open the same profile directory and would fail confusingly.
      if (this._logins.active(name)) {
        json(res, 409, {
          status: 'already_running',
          provider: name,
          message: `A login for ${name} is already in progress.`,
          login: this._logins.snapshot(name) ?? null,
        });
        return;
      }

      const driver = typeof provider.loginDriver === 'function' ? provider.loginDriver() : null;
      if (!driver) {
        // A provider without the observable-login surface (or a stub) keeps the
        // original fire-and-forget behaviour so existing embedders still work.
        if ('hasProfile' in provider && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
          const message = 'Interactive browser login needs a local graphical session on Windows or Linux Desktop. Start Conduit inside the logged-in desktop session.';
          this._activity.add('error', name, 'Login unavailable: no graphical session');
          json(res, 503, { status: 'error', provider: name, message, type: 'interactive_session_required' });
          return;
        }
        this._activity.add('info', name, 'Interactive browser login starting');
        json(res, 202, { status: 'login_started', provider: name, message: 'Interactive browser login starting. Watch Activity for progress.' });
        provider.login(loginUrl => {
          logger.info(`[${name}] login page opened: ${loginUrl}`);
          this._activity.add('info', name, 'Login page opened');
        }).then(() => {
          this._activity.add('success', name, 'Browser login completed');
        }).catch(err => {
          logger.warn(`[${name}] login error: ${err.message}`);
          this._activity.add('error', name, 'Login failed: ' + err.message.replace(/\s+/g, ' ').slice(0, 240));
        });
        return;
      }

      const display = await probeDisplay();
      if (!display.ok) {
        this._activity.add('error', name, 'Login unavailable: no usable graphical session');
        json(res, 503, {
          status: 'error',
          provider: name,
          message: display.reason ?? 'Interactive browser login needs a graphical session.',
          type: 'interactive_session_required',
          environment: { warnings: display.warnings },
        });
        return;
      }

      let snapshot: LoginSnapshot;
      try {
        snapshot = this._logins.start(driver);
      } catch (err) {
        if (err instanceof DuplicateLoginError) {
          json(res, 409, { status: 'already_running', provider: name, message: err.message, login: this._logins.snapshot(name) ?? null });
          return;
        }
        throw err;
      }

      this._activity.add('info', name, 'Interactive browser login starting');
      json(res, 202, {
        status: 'login_started',
        provider: name,
        message: 'Interactive browser login starting. Watch Activity for progress.',
        login: snapshot,
        viewer: { available: true, url: loginViewerUrl(name) },
      });
      return;
    }

    // ── POST /v1/logout/:provider ────────────────────────────────────────────
    const logoutMatch = path.match(new RegExp(`^/v1/logout/(${PROVIDER_PATTERN})$`));
    if (logoutMatch && method === 'POST') {
      const name = logoutMatch[1] as import('./types.js').ProviderName;
      await this._registry.get(name).logout();
      json(res, 200, { status: 'ok', provider: name });
      return;
    }

    // ── POST /v1/chat/completions ────────────────────────────────────────────
    if (url === '/v1/chat/completions' && method === 'POST') {
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

      const limits = this._cfg.rateLimit ?? { perMinute: 60, maxConcurrent: 16 };
      const lease = this._limiter.acquire(req.socket.remoteAddress ?? 'local', limits.perMinute, limits.maxConcurrent);
      if (!lease.ok) {
        json(res, 429, { error: { message: lease.reason, type: 'rate_limit_error' } });
        return;
      }
      res.once('close', lease.release);

      let selectedModel = model;
      let provider = this._registry.providerForModel(selectedModel);
      if (!provider) {
        lease.release();
        json(res, 404, { error: { message: `Unknown model: ${model}`, type: 'invalid_request' } });
        return;
      }

      // Try to ensure connected - will auto-restore session if needed
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
        lease.release();
        this._activity.add('warning', provider.name, 'Request blocked because provider is not connected');
        json(res, 503, { error: { message: `${provider.name} is not connected. POST /v1/login/${provider.name} to log in.`, type: 'provider_unavailable' } });
        return;
      }

      const chatReq = { model: selectedModel, messages, temperature, max_tokens, effort, signal: requestAbort.signal };
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
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
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
