import './warning-filter.js';
import { RepositoryApi } from './repository-api.js';
import { FastModeError, parseFastMode } from './fast-mode.js';
import { isEffortLevel } from './effort.js';
import { LocalServerManager } from './providers/llama-server.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { BridgeConfig, ProviderName, RepositoryConfig, ChatRequest, ProviderAdapter, ExecutionEvent } from './types.js';
import { ProviderRegistry } from './registry.js';
import { logger } from './logger.js';
import { effortCapabilities, pickEffort } from './effort.js';
import { parseCliRunMode, agentModeCwdError, agentConfinement, agentConfinementError, KNOWN_TOOLS, discoverSystemTools, normalizeDisallowedTools } from './cli-mode.js';
import { DASHBOARD_HTML, HELP_HTML } from './dashboard.js';
import { BRAND_ICON } from './ui/brand.js';
import { MetricsStore } from './metrics.js';
import { MAX_PIPELINE_PROMPT_CHARS, PipelineStore, runPipeline, type PipelineDefinition, type PipelineRun } from './pipelines.js';
import { saveConfig, resolveSecretReference } from './config.js';
import { ActivityLog } from './activity.js';
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig, type OrchestrationStrategy } from './orchestrator.js';
import { RequestLimiter } from './limits.js';
import { RunHistory } from './run-history.js';
import { BudgetExceededError, BudgetManager } from './budget.js';
import { WorkspaceManager, canonicalDirectory, isPathWithin } from './workspaces.js';
import { GovernanceManager } from './governance.js';
import { executeWithAccounting, openExecution, abortable } from './usage.js';
import { capabilitiesFor } from './model-capability.js';
import { PlatformApi, type PlatformExecutionContext } from './platform-api.js';
import type { TransactionalStateStore } from './storage.js';
import { PlatformContentError } from './platform-content.js';
import { IntegrationApi } from './integration-api.js';
import { RateLimiter } from './rate-limiter.js';
import { createSkillRegistry } from './skills/builtins.js';
import { SkillError, type SkillExecutionContext } from './skills/index.js';
import type { GitHubProjectsProvider } from './providers/github-projects.js';
import type { PlatformOperatorContext } from './platform-auth.js';
import { authenticatePlatformOperator, requirePlatformCapability } from './platform-auth.js';
import { VscodeBridgeConnection, type VscodeDispatchRequest, type VscodeDispatchResult } from './vscode-bridge.js';
import { GitWorkspaceService } from './git-workspace.js';

const CLI_PROVIDERS = new Set<ProviderName>(['cli-claude', 'cli-codex', 'cli-gemini', 'cli-grok']);
const MAX_REQUEST_BODY_BYTES = 1_048_576;

class RequestBodyTooLargeError extends Error {}

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
  private _pipelineStore: PipelineStore;
  private _budgetManager: BudgetManager;
  private _workspaceManager: WorkspaceManager;
  private _governanceManager: GovernanceManager;
  private _pipelineControllers = new Map<string, AbortController>();
  private _pipelineExecutions = new Map<string, Promise<unknown>>();
  private _eventSockets = new Set<Duplex>();
  private _vscodeSockets = new Map<Duplex, VscodeBridgeConnection>();
  private _unsubscribeActivity: (() => void) | null = null;
  private _platform: PlatformApi;
  private _integrations: IntegrationApi;
  private _repositoryApi: RepositoryApi;

  constructor(cfg: BridgeConfig, options?: {
    pipelineStore?: PipelineStore;
    budgetManager?: BudgetManager;
    workspaceManager?: WorkspaceManager;
    governanceManager?: GovernanceManager;
    platformStore?: TransactionalStateStore;
    githubProjects?: GitHubProjectsProvider;
  }) {
    this._cfg = cfg;
    this._registry = new ProviderRegistry(cfg);
    this._orchestrator = structuredClone(cfg.orchestrator ?? DEFAULT_ORCHESTRATOR);
    this._pipelineStore = options?.pipelineStore ?? new PipelineStore();
    this._budgetManager = options?.budgetManager ?? new BudgetManager(cfg.budget);
    this._workspaceManager = options?.workspaceManager ?? new WorkspaceManager();
    this._governanceManager = options?.governanceManager ?? new GovernanceManager();
    this._platform = new PlatformApi({
      cfg: () => this._cfg,
      models: () => this._registry.allModels(),
      providerForModel: model => this._registry.providerForModel(model)?.name,
      workspaces: () => this._workspaceManager.listWorkspaces(),
      resolveWorkspace: (id, cwd, repository) => this._platformWorkspace(id, cwd, repository),
      execute: (request, context) => this._platformExecute(request, context),
      diagnostics: async () => Promise.all(['cli-claude', 'cli-codex', 'cli-gemini', 'cli-grok'].map(async name => {
        const provider = this._registry.get(name as ProviderName);
        return provider?.diagnostics ? provider.diagnostics() : { provider: name, error: 'Diagnostics unavailable' };
      })),
      acquire: () => { const limits = this._cfg.rateLimit ?? { perMinute: 60, maxConcurrent: 16 }; const lease = this._limiter.acquire('platform', limits.perMinute, limits.maxConcurrent); return lease.ok ? lease.release : undefined; },
      begin: run => this._budgetManager.beginRun(run.id, { maxCostUsd: run.input.maxCostUsd }),
      finish: run => this._budgetManager.finishRun(run.id),
      spend: id => this._budgetManager.getRunSpend(id),
      event: event => this._broadcast(event),
      saveConfig: cfg => saveConfig(cfg),
      installPipeline: definition => this._pipelineStore.savePipeline(definition as PipelineDefinition),
    }, options?.platformStore);
    this._repositoryApi = new RepositoryApi({
      cfg: () => this._cfg,
      workspaces: () => this._workspaceManager.listWorkspaces(),
      repositories: () => this._governanceManager.listRepositories(),
      repositoryWorkspace: repository => this._platformWorkspace(undefined, repository.path, repository.id).workspaceId!,
      authorize: (actor, workspaceId, write) => this._skillContext(actor, workspaceId, new AbortController().signal, write, () => actor).authorize(write ? 'execute' : 'read', { skill: write ? 'git-workspace' : 'filesystem' }),
    });
    this._integrations = new IntegrationApi({
      servers: this._localServers,
      cfg: () => this._cfg, workspaces: this._workspaceManager,
      skills: this._registry.skills ?? createSkillRegistry(), githubProjects: options?.githubProjects,
      providerStatus: () => this._registry.getStatus(),
      toolContext: (operator, workspaceId, signal, approved, reauthorize) => this._skillContext(operator, workspaceId, signal, approved, reauthorize),
      acquire: () => { const limits = this._cfg.rateLimit ?? { perMinute: 60, maxConcurrent: 16 }; const lease = this._limiter.acquire('integrations', limits.perMinute, limits.maxConcurrent); return lease.ok ? lease.release : undefined; },
      event: event => this._broadcast(event),
    });
  }

  get registry(): ProviderRegistry {
    return this._registry;
  }

  get pipelineStore(): PipelineStore {
    return this._pipelineStore;
  }

  get budgetManager(): BudgetManager {
    return this._budgetManager;
  }

  get workspaceManager(): WorkspaceManager {
    return this._workspaceManager;
  }

  get governanceManager(): GovernanceManager {
    return this._governanceManager;
  }

  private readonly _localServers = new LocalServerManager();
  private _localStartup?: Promise<unknown>;
  private readonly _localStartupAbort = new AbortController();
  private _stopping = false;

  async start(): Promise<void> {
    await this._platform.start();
    this._server = createServer((req, res) => {
      this._handleRequest(req, res).catch(err => {
        logger.error(`Unhandled request error: ${err.message}`);
        if (!res.headersSent) {
          const tooLarge = err instanceof RequestBodyTooLargeError;
          res.writeHead(tooLarge ? 413 : err instanceof FastModeError ? 400 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: tooLarge ? 'Request body is too large' : err.message, type: tooLarge ? 'request_too_large' : err instanceof FastModeError ? 'invalid_request' : 'internal_error' } }));
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

    this._localStartup = this._localServers.autoStartBitNet(this._localStartupAbort.signal).then(status => {
      if (status.autoStart?.state === 'ready' || status.autoStart?.state === 'external') this._activity.add('success', 'bitnet', status.autoStart.state === 'ready' ? 'Local inference started with bridge' : 'Existing local inference server is available');
      else if (status.autoStart?.state === 'failed') this._activity.add('error', 'bitnet', status.autoStart.message || 'Local inference startup failed');
    });

    // Refresh remote API catalogs after the server is up (non-blocking).
    setTimeout(() => {
      this._registry.refreshApiModels().catch(err => logger.warn(`Model catalog refresh error: ${err.message}`));
    }, 3000);
  }

  async stop(): Promise<void> {
    if (this._server) {
      this._stopping = true;
      this._localStartupAbort.abort(new Error('Bridge is stopping'));
      for (const connection of this._vscodeSockets.values()) connection.close();
      this._vscodeSockets.clear();
      await this._platform.stop();
      await this._localStartup;
      await this._integrations.stop();
      for (const controller of this._pipelineControllers.values()) controller.abort(new Error('Bridge is stopping'));
      await Promise.allSettled(this._pipelineExecutions.values());
      this._pipelineControllers.clear();
      this._pipelineExecutions.clear();
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

  /** WebSocket clients cannot set Authorization; accept a conduit-token.* subprotocol. */
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

    return { ok: false };
  }

  private _handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    // A WebSocket upgrade is exempt from the same-origin policy and from CORS,
    // so a foreign page could otherwise subscribe to the event stream and read
    // activity data. A browser always sends Origin on an
    // upgrade and cannot forge it; non-browser clients send none.
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin && !this._allowedOrigins().has(origin)) {
      socket.destroy();
      return;
    }
    const rawPath = req.url ?? '';
    const socketPath = rawPath.split('?')[0];
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
    const vscodeOperator = rawPath === '/vscode'
      ? authenticatePlatformOperator(req.headers.authorization, this._cfg, { isLoopback: loopback })
      : null;
    const auth = socketPath === '/v1/events'
      ? this._checkSocketAuth(req)
      : rawPath === '/vscode' && vscodeOperator
        ? { ok: true as const, protocol: undefined }
        : { ok: false as const, protocol: undefined };
    if (!auth.ok) {
      rejectWebSocketUpgrade(socket, 401, 'Unauthorized');
      return;
    }
    const key = req.headers['sec-websocket-key'];
    const connectionTokens = String(req.headers.connection || '').toLowerCase().split(',').map(value => value.trim());
    if (req.method !== 'GET' || typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)
      || req.headers.upgrade?.toLowerCase() !== 'websocket' || !connectionTokens.includes('upgrade')
      || req.headers['sec-websocket-version'] !== '13') {
      rejectWebSocketUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const protocolHeader = auth.protocol ? `Sec-WebSocket-Protocol: ${auth.protocol}\r\n` : '';
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + protocolHeader + 'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    if (rawPath === '/vscode') {
      const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
      const connection = new VscodeBridgeConnection(socket, {
        authorization,
        authorize: () => Boolean(authenticatePlatformOperator(req.headers.authorization, this._cfg, { isLoopback: loopback })),
        admit: () => {
          const limits = this._cfg.rateLimit ?? { perMinute: 60, maxConcurrent: 16 };
          const lease = this._limiter.acquire(`vscode:${req.socket.remoteAddress || 'local'}`, limits.perMinute, limits.maxConcurrent);
          if (!lease.ok) return lease.reason || 'VS Code request limit reached';
          lease.release(); return undefined;
        },
        dispatch: request => this._dispatchVscode(request),
      }, head);
      this._vscodeSockets.set(socket, connection);
      const remove = () => this._vscodeSockets.delete(socket);
      socket.once('close', remove); socket.once('error', remove);
      return;
    }
    this._eventSockets.add(socket);
    socket.on('close', () => this._eventSockets.delete(socket));
    socket.on('error', () => { this._eventSockets.delete(socket); socket.destroy(); });
  }

  /** Route extension work back through the authenticated platform HTTP surface. */
  private async _dispatchVscode(request: VscodeDispatchRequest): Promise<VscodeDispatchResult> {
    if (!request.path.startsWith('/v1/platform/') || request.path.includes('?') || request.path.includes('#')) {
      throw new Error('Invalid internal VS Code route');
    }
    const address = this._server?.address();
    if (!address || typeof address === 'string') throw new Error('Bridge HTTP server is unavailable');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (request.authorization) headers.Authorization = request.authorization;
    let body: string | undefined;
    if (request.body !== undefined) {
      body = JSON.stringify(request.body);
      if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) throw new Error('VS Code request body is too large');
      headers['Content-Type'] = 'application/json';
    }
    const internalHost = address.address === '0.0.0.0' ? '127.0.0.1'
      : address.address === '::' ? '[::1]'
        : address.family === 'IPv6' ? `[${address.address}]` : address.address;
    const response = await fetch(`http://${internalHost}:${address.port}${request.path}`, {
      method: request.method, headers, body, signal: request.signal, redirect: 'error', cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const reader = response.body?.getReader();
      if (!reader) return { status: response.status, body: {} };
      const decoder = new TextDecoder(); let buffered = ''; let total = 0; let completed: unknown = {};
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        total += next.value.byteLength;
        if (total > MAX_REQUEST_BODY_BYTES) { await reader.cancel(); throw new Error('VS Code stream response is too large'); }
        buffered += decoder.decode(next.value, { stream: true });
        const blocks = buffered.split('\n\n'); buffered = blocks.pop() || '';
        for (const block of blocks) {
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const event = JSON.parse(data) as Record<string, unknown>;
          request.onEvent?.(event); if (event.type === 'done') completed = event;
        }
      }
      buffered += decoder.decode();
      if (buffered.trim()) {
        const data = buffered.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data && data !== '[DONE]') { const event = JSON.parse(data) as Record<string, unknown>; request.onEvent?.(event); if (event.type === 'done') completed = event; }
      }
      return { status: response.status, body: completed };
    }
    const reader = response.body?.getReader(); let total = 0; const chunks: Uint8Array[] = [];
    if (reader) for (;;) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_REQUEST_BODY_BYTES) { await reader.cancel(); throw new Error('VS Code platform response is too large'); }
      chunks.push(next.value);
    }
    const payload = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total).toString('utf8');
    let parsed: unknown = {};
    if (payload) { try { parsed = JSON.parse(payload); } catch { parsed = { error: { message: 'Platform returned invalid JSON', type: 'invalid_platform_response' } }; } }
    return { status: response.status, body: parsed };
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
    if (origin === 'null') return true;
    if (typeof origin === 'string' && origin) {
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

  private _launchPipeline(
    pipeline: PipelineDefinition,
    initialPrompt: string,
    options: {
      repository?: string;
      workingDirectory: string;
      correlationId: string;
      operator: string;
      overrides?: RepositoryConfig['overrides'];
      existingRun?: PipelineRun;
      approvedStepId?: string;
    },
  ): PipelineRun {
    const controller = new AbortController();
    let latestRun: PipelineRun | undefined;
    const runCostLimits = [options.existingRun?.maxCostPerRunUsd, options.overrides?.maxCostPerRunUsd]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    const execution = runPipeline(pipeline, initialPrompt, this._registry, {
      agentPolicies: this._cfg.agentPolicies,
      budgetManager: this._budgetManager,
      governanceManager: this._governanceManager,
      metrics: this._metrics,
      signal: controller.signal,
      existingRun: options.existingRun,
      approvedStepId: options.approvedStepId,
      repository: options.repository,
      workingDirectory: options.workingDirectory,
      correlationId: options.correlationId,
      operator: options.operator,
      maxCostPerRunUsd: runCostLimits.length ? Math.min(...runCostLimits) : undefined,
      resolveExecutionPolicy: (providerName, mode) => {
        const providerPolicy = this._cfg.agentPolicies?.[providerName as ProviderName];
        if (mode === 'agent' && (providerPolicy?.agentEnabled === false || options.overrides?.agentEnabled === false)) {
          return { allowed: false, reason: `Agent mode is disabled for provider '${providerName}' by policy` };
        }
        const allowUnconfined = options.overrides?.allowUnconfined === true
          || providerPolicy?.allowUnconfined === true
          || this._cfg.allowUnconfined === true;
        const confinementError = agentConfinementError(providerName, mode, { allowUnconfined });
        if (confinementError) {
          return { allowed: false, reason: confinementError };
        }
        try {
          const disallowedTools = normalizeDisallowedTools(options.overrides?.disallowedTools ?? providerPolicy?.disallowedTools);
          return { allowed: true, ...(disallowedTools ? { disallowedTools } : {}) };
        } catch (err) {
          return { allowed: false, reason: (err as Error).message };
        }
      },
      onRunUpdate: run => {
        this._pipelineStore.recordRun(run);
        latestRun = structuredClone(run);
        this._broadcast({ type: 'pipeline_run', run });
      },
      onEvent: (level, message, details, metadata) => {
        const runId = typeof metadata?.runId === 'string' ? metadata.runId : latestRun?.id;
        const stepId = typeof metadata?.stepId === 'string' ? metadata.stepId : undefined;
        const step = pipeline.steps.find(item => item.id === stepId);
        const provider = step ? this._registry.providerForModel(step.model)?.name : undefined;
        const status = runId ? this._pipelineStore.getRun(runId)?.status : undefined;
        this._activity.add(level, 'pipeline', details ? `${message} (${details})` : message, {
          traceId: options.correlationId,
          runId,
          stepId,
          provider,
          model: step?.model,
          status,
        });
      },
    });
    if (!latestRun) {
      void execution.catch(error => logger.error(`Pipeline setup failed: ${error instanceof Error ? error.message : String(error)}`));
      throw new Error('Pipeline did not publish its initial state');
    }
    const runId = latestRun.id;
    this._pipelineControllers.set(runId, controller);
    const tracked = execution.catch(error => {
      const stored = this._pipelineStore.getRun(runId);
      if (!stored || !['running', 'waiting_approval'].includes(stored.status)) return;
      const failed: PipelineRun = {
        ...stored,
        status: controller.signal.aborted ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: Date.now(),
      };
      this._pipelineStore.recordRun(failed);
      this._activity.add('error', 'pipeline', `Pipeline ${failed.status}: ${failed.error}`, {
        traceId: options.correlationId, runId, status: failed.status,
      });
    }).finally(() => {
      this._pipelineControllers.delete(runId);
      this._pipelineExecutions.delete(runId);
    }).catch(error => logger.error(`Pipeline finalization failed: ${error instanceof Error ? error.message : String(error)}`));
    this._pipelineExecutions.set(runId, tracked);
    return latestRun;
  }

  private _platformWorkspace(id?: string, cwd?: string, repositoryId?: string): { cwd?: string; workspaceId?: string; repository?: string; requiresApproval?: boolean; maxCostUsd?: number } {
    const workspaces = this._workspaceManager.listWorkspaces();
    const workspace = id ? workspaces.find(w => w.id === id) : undefined;
    if (id && !workspace) throw new PlatformContentError('Workspace is not registered', 400);
    const repository = repositoryId ? this._governanceManager.getRepository(repositoryId) : undefined;
    if (repositoryId && !repository) throw new PlatformContentError('Repository is not registered', 400);
    const requested = cwd || workspace?.path || repository?.defaultWorkspace || repository?.path;
    const resolved = this._workspaceManager.resolveWorkingDirectory(requested, repository ? [repository.path] : [], !repository);
    if (!resolved.ok || !resolved.path) throw new PlatformContentError(resolved.error || 'Working directory is unavailable', 403);
    const selected = workspace || workspaces.filter(w => { const root = canonicalDirectory(w.path); return root && isPathWithin(root, resolved.path!); }).sort((a, b) => b.path.length - a.path.length)[0];
    if (!selected) throw new PlatformContentError('Register this repository as a workspace before platform execution', 403);
    const root = canonicalDirectory(selected.path);
    if (!root || !isPathWithin(root, resolved.path)) throw new PlatformContentError('Working directory is outside the selected workspace', 403);
    const effectiveRepo = repository || this._governanceManager.findRepositoryForPath(resolved.path);
    return { cwd: resolved.path, workspaceId: selected.id, repository: effectiveRepo?.id, requiresApproval: Boolean(effectiveRepo?.overrides?.requireApproval || effectiveRepo?.overrides?.mandatoryGates?.length), maxCostUsd: effectiveRepo?.overrides?.maxCostPerRunUsd };
  }

  private _skillContext(operator: PlatformOperatorContext, workspaceId: string | undefined, signal: AbortSignal, approved: boolean, reauthorize: () => PlatformOperatorContext): SkillExecutionContext {
    const selected = workspaceId ? this._platformWorkspace(workspaceId) : undefined;
    const workspace = selected?.cwd && selected.workspaceId ? { id: selected.workspaceId, root: selected.cwd, repository: selected.repository } : undefined;
    if (workspaceId && !workspace) throw new SkillError('Registered workspace is unavailable', 403);
    const authorize: SkillExecutionContext['authorize'] = (effect, details) => {
      const current = reauthorize();
      requirePlatformCapability(current, effect === 'read' ? 'view' : 'operate', workspace?.id);
      const live = workspace ? this._platformWorkspace(workspace.id) : undefined;
      if (workspace && live?.cwd !== workspace.root) throw new SkillError('Workspace configuration changed during execution', 403);
      if (workspace && live?.repository !== workspace.repository) throw new SkillError('Repository authorization changed during execution', 403);
      const repository = live?.repository ? this._governanceManager.getRepository(live.repository) : undefined;
      const skill = details?.skill;
      if (effect === 'execute' || skill === 'github-actions') requirePlatformCapability(current, 'admin', workspace?.id);
      if ((effect === 'execute' || effect === 'write') && skill !== 'memory') {
        if (!approved) throw new SkillError('This tool changes files or external state; the caller must explicitly approve this invocation', 403);
        if (repository && (repository.overrides?.agentEnabled === false || live?.requiresApproval)) throw new SkillError('Repository policy requires its governed pipeline for this mutation', 403);
      }
      const restrictions = new Set(normalizeDisallowedTools(repository?.overrides?.disallowedTools)?.split(',').map(value => value.trim()) ?? []);
      const required = skill === 'filesystem' ? effect === 'write' ? ['Write', 'Edit'] : ['Read', 'Glob'] : skill === 'code-search' ? ['Read', 'Glob', 'Grep', 'FileSearch'] : skill === 'browser' ? ['WebFetch'] : skill === 'web-search' ? ['WebSearch'] : skill === 'git-workspace' ? [] : effect === 'execute' ? ['Bash', 'Shell'] : [];
      if (required.some(tool => restrictions.has(tool))) throw new SkillError('Repository tool policy forbids this operation', 403);
    };
    return {
      operator, workspace, signal, store: this._platform.store, authorize,
      rateLimiter: new RateLimiter(undefined, this._cfg.agentRateLimits),
      resolveModel: async (name, explicit) => {
        reauthorize();
        let provider = this._registry.lookup(name);
        if (!explicit && name === 'lmstudio' && !await provider?.checkSession()) provider = this._registry.lookup('bitnet');
        if (!provider || !await provider.checkSession()) throw new SkillError('Selected model provider is unavailable', 503);
        if (explicit) {
          if (this._registry.providerForModel(explicit)?.name !== provider.name) throw new SkillError('Model does not belong to the selected task provider', 400);
          return explicit;
        }
        const model = provider.models.find(model => model.id.endsWith('/auto')) ?? provider.models.find(model => !/embed/i.test(model.id));
        if (!model) throw new SkillError('Provider has no available chat model', 503);
        return model.id;
      },
      githubToken: () => process.env.GITHUB_TOKEN,
      executeModel: request => {
        const current = reauthorize();
        return this._platformExecute({ ...request, signal: AbortSignal.any([signal, ...(request.signal ? [request.signal] : [])]) }, { operator: current, workspaceId: workspace?.id, repository: workspace?.repository });
      },
    };
  }

  private async _platformExecute(original: ChatRequest, context: PlatformExecutionContext): Promise<string> {
    const workspace = (context.workspaceId && context.workspaceId !== 'default') || original.cwd || original.mode === 'agent'
      ? this._platformWorkspace(context.workspaceId === 'default' ? undefined : context.workspaceId, original.cwd, context.repository) : {};
    requirePlatformCapability(context.operator, 'operate', workspace.workspaceId);
    const repository = workspace.repository ? this._governanceManager.getRepository(workspace.repository) : undefined;
    let registry = this._registry;
    if (context.profile) {
      const profile = context.profile;
      const profileConfig: BridgeConfig = { ...this._cfg, apiKeys: { ...this._cfg.apiKeys }, cliExecutables: { ...this._cfg.cliExecutables } };
      if (profile.credentialRef) {
        const secret = resolveSecretReference(profile.credentialRef, this._cfg.securityStorage);
        if (!secret) throw new PlatformContentError('Profile credential is unavailable', 503);
        profileConfig.apiKeys[profile.provider as keyof BridgeConfig['apiKeys']] = secret;
      }
      if (profile.cliExecutable) profileConfig.cliExecutables![profile.provider as keyof NonNullable<BridgeConfig['cliExecutables']>] = profile.cliExecutable;
      registry = new ProviderRegistry(profileConfig);
    }
    const provider = registry.providerForModel(original.model);
    if (!provider) throw new PlatformContentError('Unknown provider/model', 400);
    if (context.profile && context.profile.provider !== provider.name) throw new PlatformContentError('Profile provider mismatch', 403);
    const policy = this._cfg.agentPolicies?.[provider.name];
    const mode = original.mode || 'chat';
    if (mode === 'agent' && (policy?.agentEnabled === false || repository?.overrides?.agentEnabled === false)) throw new PlatformContentError('Agent mode is disabled by provider or repository policy', 403);
    if (mode === 'agent' && workspace.requiresApproval) throw new PlatformContentError('This repository requires governed pipeline execution. Use its assigned pipeline and required gates.', 403);
    const allowUnconfined = original.allowUnconfined === true
      || repository?.overrides?.allowUnconfined === true
      || policy?.allowUnconfined === true
      || this._cfg.allowUnconfined === true;
    const request = { ...original, cliSessionKey: context.sessionId ? JSON.stringify([context.operator.operatorId, context.sessionId, context.profile?.id ?? null]) : undefined, mode, allowUnconfined, cwd: workspace.cwd, disallowedTools: normalizeDisallowedTools(repository?.overrides?.disallowedTools ?? policy?.disallowedTools), effort: pickEffort({ effort: original.effort ?? context.profile?.defaultEffort }), fastMode: parseFastMode(original.fastMode) ?? context.profile?.defaultFastMode };
    const cwdError = agentModeCwdError(mode, request.cwd); if (cwdError) throw new PlatformContentError(cwdError, 400);
    const confinementError = agentConfinementError(provider.name, mode, { allowUnconfined });
    if (confinementError) throw new PlatformContentError(confinementError, 403);
    const runId = context.runId || `chat-${randomUUID()}`;
    const executeAttempt = async (targetModel: string, targetProvider: ProviderAdapter): Promise<string> => {
      let execution: ReturnType<typeof openExecution> | undefined;
      let out = '';
      const started = Date.now();
      const targetReq = { ...request, model: targetModel, onExecutionEvent: context.onExecutionEvent };
      try {
        execution = openExecution(targetProvider, targetReq, { budgetManager: this._budgetManager, metrics: this._metrics, runId });
        if (context.onDelta) {
          const iterator = targetProvider.chatStream(execution.request);
          try {
            for (;;) {
              const chunk = await abortable(iterator.next(), execution.request.signal) as IteratorResult<string>;
              if (chunk.done) break;
              if (out.length + chunk.value.length > execution.maxOutputChars) throw new PlatformContentError('Provider output exceeds the configured output limit', 400);
              out += chunk.value; context.onDelta(chunk.value);
            }
          } finally { if (execution.request.signal?.aborted) void iterator.return(undefined).catch(() => {}); }
        } else {
          out = await abortable(targetProvider.chat(execution.request), execution.request.signal);
          if (out.length > execution.maxOutputChars) throw new PlatformContentError('Provider output exceeds the configured output limit', 400);
        }
        execution.finish(out);
        this._activity.add('success', 'platform', 'Model request completed', { runId, provider: targetProvider.name, model: targetModel, durationMs: Date.now() - started, status: 'completed' });
        return out;
      } catch (error) {
        execution?.finish(out, error);
        this._activity.add('error', 'platform', 'Model request failed', { runId, provider: targetProvider.name, model: targetModel, durationMs: Date.now() - started, status: 'failed' });
        throw error;
      } finally {
        execution?.dispose();
      }
    };

    try {
      this._budgetManager.beginRun(runId, { maxCostUsd: repository?.overrides?.maxCostPerRunUsd });
      let primaryConnected = false;
      try { primaryConnected = await provider.checkSession(); } catch { primaryConnected = false; }
      if (primaryConnected) {
        try {
          return await executeAttempt(original.model, provider);
        } catch (error) {
          if (mode === 'agent' || !context.fallbackModels?.length) throw error;
        }
      } else if (mode === 'agent' || !context.fallbackModels?.length) {
        throw new PlatformContentError(`${provider.name} is not connected; authenticate the selected CLI or configure its API credential`, 503);
      }

      if (mode === 'chat' && context.fallbackModels?.length) {
        for (const candidate of context.fallbackModels) {
          if (candidate === original.model) continue;
          const candidateProvider = registry.providerForModel(candidate);
          if (!candidateProvider) continue;
          let candidateConnected = false;
          try { candidateConnected = await candidateProvider.checkSession(); } catch { candidateConnected = false; }
          if (!candidateConnected) continue;
          context.onFallbackModelUsed?.(candidate);
          this._activity.add('info', 'platform', `Chat request fell back from ${original.model} to ${candidate}`, { runId, model: candidate, provider: candidateProvider.name });
          return await executeAttempt(candidate, candidateProvider);
        }
      }

      throw new PlatformContentError(`${provider.name} is not connected; authenticate the selected CLI or configure its API credential`, 503);
    } finally {
      if (!context.runId) this._budgetManager.finishRun(runId);
    }
  }

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this._stopping) { res.writeHead(503, { 'Content-Type': 'application/json', Connection: 'close' }); res.end(JSON.stringify({ error: { message: 'Bridge is stopping' } })); return; }
    const url = req.url ?? '/';
    const path = url.split('?')[0];
    const method = req.method ?? 'GET';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    const contentLength = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
      json(res, 413, { error: { message: 'Request body is too large', type: 'request_too_large' } });
      return;
    }

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

    if ((path === '/favicon.svg' || path === '/favicon.ico') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      res.end(BRAND_ICON);
      return;
    }
    const fontName = path.startsWith('/assets/fonts/') ? path.slice('/assets/fonts/'.length) : '';
    if (method === 'GET' && ['inter-400.woff2','inter-500.woff2','inter-600.woff2','fraunces-600.woff2'].includes(fontName)) {
      res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=86400' });
      res.end(readFileSync(new URL('./assets/fonts/' + fontName, import.meta.url)));
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

    if (await this._repositoryApi.handle(req, res, () => readBody(req))) return;
    if (await this._integrations.handle(req, res, () => readBody(req))) return;

    // Scoped platform tokens authorize only the platform routes, not legacy admin APIs.
    if (await this._platform.handle(req, res, () => readBody(req))) return;

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
        // Additive, ignored by strict OpenAI clients. Without it the picker can
        // only show the raw slug, so a resold model such as
        // cli-gemini/claude-sonnet-4-6 would appear under a Gemini heading with
        // nothing to say which CLI actually serves it.
        display_name: m.displayName,
        // Only present where the transport really bounds the prompt.
        ...(m.maxPromptChars ? { max_prompt_chars: m.maxPromptChars } : {}),
        // Token window and output cap, so a client stops keeping its own copy
        // — one that goes stale the moment a catalog is discovered, not pinned.
        ...(m.contextWindow ? { context_window: m.contextWindow } : {}),
        ...(m.maxOutputTokens ? { max_output_tokens: m.maxOutputTokens } : {}),
        capabilities: m.capabilities ?? capabilitiesFor(m.provider, m.id),
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
      const accountingRunId = `compare-${randomUUID()}`;
      req.once('aborted', () => controller.abort());
      const models = data.models.filter((model: any) => typeof model === 'string').slice(0, 8);
      const run = async (model: string) => {
        const started = Date.now();
        const provider = this._registry.providerForModel(model);
        if (!provider || !(await provider.ensureConnected())) return { model, ok: false, latencyMs: Date.now() - started, error: 'provider unavailable' };
        try {
          const content = await executeWithAccounting(provider, {
            model, messages: [{ role: 'user', content: data.prompt }], effort: data.effort, fastMode: parseFastMode(data.fastMode),
            max_tokens: typeof data.max_tokens === 'number' ? Math.min(Math.max(1, data.max_tokens), 4096) : 256,
            signal: controller.signal,
          }, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
          return { model, ok: true, latencyMs: Date.now() - started, content };
        } catch (err) {
          return { model, ok: false, latencyMs: Date.now() - started, error: (err as Error).message.slice(0, 240) };
        }
      };
      const results = await Promise.all(models.map(run));
      this._budgetManager.finishRun(accountingRunId);
      json(res, 200, { object: 'conduit.comparison', prompt_hash: createHash('sha256').update(data.prompt).digest('hex').slice(0, 16), results });
      return;
    }

    if (path === '/v1/orchestrator' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const strategies = new Set<OrchestrationStrategy>(['sequential', 'parallel', 'debate']);
      const roles = Array.isArray(data?.roles) ? data.roles.filter((r: any) => typeof r?.name === 'string' && typeof r?.model === 'string').slice(0, 8).map((r: any) => ({ name: r.name.trim().slice(0, 60), model: r.model.trim().slice(0, 180), effort: isEffortLevel(r.effort) ? r.effort : undefined, fastMode: parseFastMode(r.fastMode) })) : this._orchestrator.roles;
      this._orchestrator = { enabled: Boolean(data?.enabled), strategy: strategies.has(data?.strategy) ? data.strategy : 'sequential', roles, fallbackFastMode: parseFastMode(data?.fallbackFastMode), fallbackEffort: isEffortLevel(data?.fallbackEffort) ? data.fallbackEffort : undefined, fallbackModels: Array.isArray(data?.fallbackModels) ? data.fallbackModels.filter((m: any) => typeof m === 'string').slice(0, 8) : [] };
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
      const accountingRunId = `orchestrator-${randomUUID()}`;
      this._activity.add('info', 'orchestrator', 'Run started with ' + this._orchestrator.strategy + ' strategy');
      const runRole = async (role: { name: string; model: string; effort?: string; fastMode?: boolean }, prompt: string) => {
        const candidates = [role.model, ...this._orchestrator.fallbackModels].filter((model, i, all) => model && all.indexOf(model) === i);
        let lastError: unknown = new Error(role.name + ': no usable model');
        for (const model of candidates) {
          try {
            const provider = this._registry.providerForModel(model);
            if (!provider || !(await provider.ensureConnected())) throw new Error('model is unavailable');
            this._activity.add('info', 'orchestrator', role.name + ' started on ' + model);
            const content = await executeWithAccounting(provider, {
              model, messages: [{ role: 'user', content: prompt }], effort: data.effort || (model === role.model ? role.effort : this._orchestrator.fallbackEffort), fastMode: parseFastMode(data.fastMode) ?? (model === role.model ? role.fastMode : this._orchestrator.fallbackFastMode),
            }, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
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
        const budget = err instanceof BudgetExceededError;
        json(res, budget ? 402 : 503, { error: { message: (err as Error).message, type: budget ? 'budget_exceeded' : 'orchestrator_error' } });
      } finally {
        this._budgetManager.finishRun(accountingRunId);
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
      const accountingRunId = `cli-test-${randomUUID()}`;
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
          const content = await executeWithAccounting(provider, {
            model, messages: [{ role: 'user', content: 'Reply with exactly: pong' }], max_tokens: 16,
          }, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
          const ok = content.trim().toLowerCase().includes('pong');
          results.push({ provider: providerName, model, ok, latencyMs: Date.now() - started, output: content.slice(0, 160) });
          this._activity.add(ok ? 'success' : 'warning', 'cli-test', providerName + (ok ? ' passed ping-pong' : ' returned an unexpected response'));
        } catch (err) {
          results.push({ provider: providerName, model, ok: false, latencyMs: Date.now() - started, error: (err as Error).message.slice(0, 240) });
          this._activity.add('error', 'cli-test', providerName + ' failed: ' + (err as Error).message.slice(0, 200));
        }
      }
      this._budgetManager.finishRun(accountingRunId);
      json(res, 200, { object: 'conduit.cli_test', results });
      return;
    }

    if (path === '/v1/responses' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const input = typeof data?.input === 'string' ? data.input : Array.isArray(data?.input) ? data.input : '';
      if (!data?.model || !input) { json(res, 400, { error: { message: 'model and input required', type: 'invalid_request' } }); return; }
      if (!this._limit(req, res)) return;
      const messages = typeof input === 'string' ? [{ role: 'user' as const, content: input }] : input;
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once('aborted', abort);
      res.once('close', () => { if (!res.writableEnded) abort(); });
      const provider = this._registry.providerForModel(data.model);
      if (!provider || !(await provider.ensureConnected())) { json(res, 503, { error: { message: 'Response provider is unavailable', type: 'provider_unavailable' } }); return; }
      try {
        const content = await executeWithAccounting(provider, {
          model: data.model, messages, effort: data.reasoning?.effort || data.reasoning_effort, fastMode: parseFastMode(data.fastMode),
          max_tokens: data.max_output_tokens, signal: controller.signal,
        }, { budgetManager: this._budgetManager, metrics: this._metrics });
        json(res, 200, { id: 'resp-' + Date.now(), object: 'response', model: data.model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] }], status: 'completed' });
      } catch (err) {
        const budget = err instanceof BudgetExceededError;
        json(res, budget ? 402 : 503, { error: { message: (err as Error).message, type: budget ? 'budget_exceeded' : 'provider_error' } });
      }
      return;
    }

    if (path === '/v1/embeddings' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      if (!data?.model || (!data.input && data.input !== '')) { json(res, 400, { error: { message: 'model and input required', type: 'invalid_request' } }); return; }
      if (!this._limit(req, res)) return;
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

    if (path === '/v1/settings/agent-policy' && method === 'GET') {
      const allProviders: ProviderName[] = [
        'cli-claude', 'cli-gemini', 'cli-codex', 'cli-grok',
        'claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api',
        'lmstudio', 'bitnet',
      ];
      const policies = Object.fromEntries(allProviders.map(name => {
        const isCli = CLI_PROVIDERS.has(name);
        const stored = this._cfg.agentPolicies?.[name];
        return [name, {
          provider: name,
          loginType: isCli ? 'cli' : (name === 'lmstudio' || name === 'bitnet' ? 'local' : 'api-key'),
          hasAgentCapability: isCli,
          confinement: isCli ? agentConfinement(name as any) : undefined,
          supportedModes: isCli ? ['chat', 'plan', 'agent'] : ['chat'],
          agentEnabled: stored ? Boolean(stored.agentEnabled) : isCli,
          allowUnconfined: stored?.allowUnconfined ?? false,
          defaultMode: stored?.defaultMode || 'chat',
          disallowedTools: stored?.disallowedTools || (isCli ? 'Write,Edit,NotebookEdit,Bash' : ''),
        }];
      }));
      json(res, 200, { object: 'conduit.agent_policies', policies });
      return;
    }

    if (path === '/v1/settings/agent-policy' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch { json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } }); return; }
      const allProviders = new Set<ProviderName>([
        'cli-claude', 'cli-gemini', 'cli-codex', 'cli-grok',
        'claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api',
        'lmstudio', 'bitnet',
      ]);
      if (!allProviders.has(data?.provider)) {
        json(res, 400, { error: { message: `Unknown provider: ${data?.provider}`, type: 'invalid_request' } });
        return;
      }
      const provider = data.provider as ProviderName;
      const isCli = CLI_PROVIDERS.has(provider);
      const agentEnabled = typeof data.agentEnabled === 'boolean' ? data.agentEnabled : (isCli ? true : false);
      if (!isCli && agentEnabled) {
        json(res, 400, { error: { message: `Provider '${provider}' does not support agent execution`, type: 'invalid_request' } });
        return;
      }
      const allowUnconfined = typeof data.allowUnconfined === 'boolean' ? data.allowUnconfined : false;
      const validModes = isCli ? ['chat', 'plan', 'agent'] : ['chat'];
      const defaultMode = validModes.includes(data.defaultMode) ? data.defaultMode : 'chat';
      let disallowedTools: string | undefined;
      try {
        disallowedTools = normalizeDisallowedTools(data.disallowedTools);
      } catch (err) {
        json(res, 400, { error: { message: (err as Error).message, type: 'invalid_request' } });
        return;
      }

      this._cfg.agentPolicies = this._cfg.agentPolicies || {};
      this._cfg.agentPolicies[provider] = {
        agentEnabled,
        ...(allowUnconfined ? { allowUnconfined: true } : {}),
        defaultMode,
        ...(disallowedTools ? { disallowedTools } : {}),
      };
      saveConfig({ agentPolicies: { ...this._cfg.agentPolicies } });
      this._activity.add('success', 'settings', `${provider} agent policy updated (agent: ${agentEnabled ? 'enabled' : 'disabled'}, default: ${defaultMode})`);
      json(res, 200, { status: 'saved', provider, policy: this._cfg.agentPolicies[provider] });
      return;
    }

    if (path === '/v1/tools' && method === 'GET') {
      const systemTools = discoverSystemTools();
      json(res, 200, { object: 'list', data: KNOWN_TOOLS, system_tools: systemTools });
      return;
    }

    if (path === '/v1/tools/discover' && method === 'POST') {
      const systemTools = discoverSystemTools(true);
      json(res, 200, { object: 'list', data: systemTools });
      return;
    }

    if (path === '/v1/repositories' && method === 'GET') {
      json(res, 200, { object: 'list', data: this._governanceManager.listRepositories() });
      return;
    }

    if (path === '/v1/repositories' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      if (!data?.id || !data?.name || !data?.path) {
        json(res, 400, { error: { message: 'id, name, and path are required', type: 'invalid_request' } });
        return;
      }
      if (data.enabledPipelines !== undefined && (!Array.isArray(data.enabledPipelines) || data.enabledPipelines.some((id: unknown) => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)))) {
        json(res, 400, { error: { message: 'enabledPipelines must contain safe pipeline IDs', type: 'invalid_request' } });
        return;
      }
      const overrides = data.overrides;
      if (overrides !== undefined && (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))) {
        json(res, 400, { error: { message: 'overrides must be an object', type: 'invalid_request' } });
        return;
      }
      try {
        const disallowedTools = overrides?.disallowedTools === undefined ? undefined : normalizeDisallowedTools(overrides.disallowedTools);
        if (overrides?.agentEnabled !== undefined && typeof overrides.agentEnabled !== 'boolean') throw new Error('agentEnabled must be a boolean');
        if (overrides?.requireApproval !== undefined && typeof overrides.requireApproval !== 'boolean') throw new Error('requireApproval must be a boolean');
        if (overrides?.maxCostPerRunUsd !== undefined && (typeof overrides.maxCostPerRunUsd !== 'number' || !Number.isFinite(overrides.maxCostPerRunUsd) || overrides.maxCostPerRunUsd < 0)) throw new Error('maxCostPerRunUsd must be a finite non-negative number');
        if (overrides?.mandatoryGates !== undefined && (!Array.isArray(overrides.mandatoryGates) || overrides.mandatoryGates.some((id: unknown) => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)))) throw new Error('mandatoryGates must contain safe step IDs');
        if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) throw new Error('Repository name must contain 1–200 characters');
        if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 2000)) throw new Error('Repository description must not exceed 2000 characters');
        if (data.assignedGovernancePipeline !== undefined && (typeof data.assignedGovernancePipeline !== 'string' || !/^[\w-]{1,100}$/.test(data.assignedGovernancePipeline))) throw new Error('assignedGovernancePipeline must be a safe pipeline ID');
        if (data.defaultWorkspace !== undefined && typeof data.defaultWorkspace !== 'string') throw new Error('defaultWorkspace must be a path string');
        const saved = this._governanceManager.saveRepository({
          id: String(data.id),
          name: data.name.trim(),
          path: String(data.path),
          description: data.description,
          assignedGovernancePipeline: data.assignedGovernancePipeline,
          enabledPipelines: data.enabledPipelines ? [...new Set<string>(data.enabledPipelines)] : undefined,
          defaultWorkspace: data.defaultWorkspace,
          overrides: overrides ? {
            ...overrides,
            ...(disallowedTools ? { disallowedTools } : {}),
            mandatoryGates: overrides.mandatoryGates ? [...new Set<string>(overrides.mandatoryGates)] : undefined,
          } : undefined,
        });
        this._cfg.repositories = this._governanceManager.listRepositories();
        saveConfig({ repositories: this._cfg.repositories });
        this._activity.add('success', 'governance', `Saved repository: ${saved.name} (${saved.id})`);
        json(res, 200, { status: 'saved', repository: saved });
      } catch (err) {
        json(res, 400, { error: { message: (err as Error).message, type: 'invalid_request' } });
      }
      return;
    }

    if (path.startsWith('/v1/repositories/') && method === 'DELETE') {
      const repoId = decodeURIComponent(path.slice('/v1/repositories/'.length));
      if (!repoId) {
        json(res, 400, { error: { message: 'Repository id is required', type: 'invalid_request' } });
        return;
      }
      const deleted = this._governanceManager.deleteRepository(repoId);
      if (!deleted) {
        json(res, 404, { error: { message: `Repository not found: ${repoId}`, type: 'not_found' } });
        return;
      }
      this._cfg.repositories = this._governanceManager.listRepositories();
      saveConfig({ repositories: this._cfg.repositories });
      this._activity.add('info', 'governance', `Deleted repository: ${repoId}`);
      json(res, 200, { status: 'deleted', id: repoId });
      return;
    }

    if (path === '/v1/governance/audit' && method === 'GET') {
      const queryParams = new URL(req.url ?? '/', 'http://localhost').searchParams;
      const repo = queryParams.get('repository') || undefined;
      const action = queryParams.get('action') || undefined;
      const limitStr = queryParams.get('limit');
      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      const trail = this._governanceManager.listAuditTrail({ repository: repo, action, limit });
      json(res, 200, { object: 'list', data: trail });
      return;
    }

    if (path === '/v1/governance/audit/export' && method === 'GET') {
      const queryParams = new URL(req.url ?? '/', 'http://localhost').searchParams;
      const format = queryParams.get('format') === 'markdown' ? 'markdown' : 'json';
      const output = this._governanceManager.exportAuditTrail(format);
      if (format === 'markdown') {
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="conduit-governance-audit.md"',
        });
        res.end(output);
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="conduit-governance-audit.json"',
        });
        res.end(output);
      }
      return;
    }

    if (path === '/v1/budgets' && method === 'GET') {
      json(res, 200, {
        object: 'conduit.budget',
        config: this._budgetManager.getConfig(),
        usage: this._budgetManager.getUsage(),
        status: this._budgetManager.getStatus(),
      });
      return;
    }

    if (path === '/v1/budgets' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      const updated = this._budgetManager.updateConfig(data);
      this._cfg.budget = updated;
      saveConfig({ budget: updated });
      this._activity.add('success', 'budget', `Budget settings updated (daily: $${updated.dailyBudgetUsd}, monthly: $${updated.monthlyBudgetUsd})`);
      json(res, 200, { status: 'updated', config: updated, status_summary: this._budgetManager.getStatus() });
      return;
    }

    if (path === '/v1/workspaces' && method === 'GET') {
      json(res, 200, { object: 'list', data: this._workspaceManager.listWorkspaces() });
      return;
    }

    if (path === '/v1/workspaces' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      if (!data?.path || typeof data.path !== 'string') {
        json(res, 400, { error: { message: 'Path is required', type: 'invalid_request' } });
        return;
      }
      const result = this._workspaceManager.addOrUpdateWorkspace(data.path, data.name, Boolean(data.isDefault));
      if (!result.ok || !result.entry) {
        json(res, 400, { error: { message: result.error || 'Failed to add workspace', type: 'invalid_request' } });
        return;
      }
      this._activity.add('success', 'workspace', `Workspace registered: ${result.entry.name} (${result.entry.path})`);
      json(res, 200, { status: 'saved', workspace: result.entry });
      return;
    }

    if (path === '/v1/workspaces/browse' && method === 'POST') {
      const body = await readBody(req);
      let data: any = {};
      if (body) {
        try { data = JSON.parse(body); } catch { /* allow empty */ }
      }
      const browse = this._workspaceManager.browseDirectory(data?.directory || data?.path);
      json(res, 200, browse);
      return;
    }

    if (path.startsWith('/v1/workspaces/') && method === 'DELETE') {
      const wsId = decodeURIComponent(path.slice('/v1/workspaces/'.length));
      if (!wsId) {
        json(res, 400, { error: { message: 'Workspace id is required', type: 'invalid_request' } });
        return;
      }
      const removed = this._workspaceManager.removeWorkspace(wsId);
      if (!removed) {
        json(res, 404, { error: { message: `Workspace not found: ${wsId}`, type: 'not_found' } });
        return;
      }
      this._activity.add('info', 'workspace', `Workspace removed: ${wsId}`);
      json(res, 200, { status: 'deleted', id: wsId });
      return;
    }

    if (path === '/v1/activity/export' && method === 'GET') {
      const queryParams = new URL(req.url ?? '/', 'http://localhost').searchParams;
      const format = queryParams.get('format') === 'markdown' ? 'markdown' : 'json';
      const events = this._activity.snapshot(200);
      if (format === 'markdown') {
        const lines = [
          '# Conduit Bridge Activity Log',
          '',
          `Generated: ${new Date().toISOString()}`,
          `Total Events: ${events.length}`,
          '',
          '| Time | Level | Scope | Message | Trace | Run | Step | Provider | Model | Status | Attempt | Duration (ms) |',
          '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | ---: | ---: |',
        ];
        for (const ev of events) {
          const time = new Date(ev.time).toISOString();
          const cleanMsg = ev.message.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
          const cell = (value: unknown) => typeof value === 'string'
            ? value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
            : (value ?? '-');
          lines.push(`| ${time} | ${ev.level.toUpperCase()} | ${cell(ev.scope)} | ${cleanMsg} | ${cell(ev.traceId)} | ${cell(ev.runId)} | ${cell(ev.stepId)} | ${cell(ev.provider)} | ${cell(ev.model)} | ${cell(ev.status)} | ${cell(ev.attempt)} | ${cell(ev.durationMs)} |`);
        }
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="conduit-activity.md"',
        });
        res.end(lines.join('\n'));
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="conduit-activity.json"',
        });
        res.end(JSON.stringify(events, null, 2));
      }
      return;
    }

    if (path === '/v1/analytics/overview' && method === 'GET') {
      const metricsSnap = this._metrics.snapshot();
      const budgetStatus = this._budgetManager.getStatus();
      const pipelineRuns = this._pipelineStore.listRuns();
      const events = this._activity.snapshot(200);
      const repositories = this._governanceManager.listRepositories();
      const auditTrail = this._governanceManager.listAuditTrail();

      let totalRequests = 0;
      let totalSuccesses = 0;
      let totalErrors = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTokens = 0;
      let totalCostUsd = 0;
      let totalLatencyMs = 0;
      let latencyCount = 0;

      const modelStats = Object.entries(metricsSnap).map(([modelId, m]) => {
        const avgLat = m.averageLatencyMs ?? 0;
        totalRequests += m.requests;
        totalSuccesses += m.successes;
        totalErrors += m.failures;
        totalInputTokens += m.inputTokens;
        totalOutputTokens += m.outputTokens;
        totalTokens += (m.inputTokens + m.outputTokens);
        totalCostUsd += m.estimatedCostUsd;
        const completedRequests = m.successes + m.failures;
        if (avgLat > 0 && completedRequests > 0) {
          totalLatencyMs += avgLat * completedRequests;
          latencyCount += completedRequests;
        }
        const providerName = modelId.split('/')[0] || 'unknown';
        return {
          model: modelId,
          provider: providerName,
          requests: m.requests,
          successes: m.successes,
          errors: m.failures,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          tokens: m.inputTokens + m.outputTokens,
          costUsd: m.estimatedCostUsd,
          avgLatencyMs: avgLat,
          p50LatencyMs: m.p50LatencyMs,
          p95LatencyMs: m.p95LatencyMs,
        };
      });

      const avgLatencyMs = latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0;

      const pipelineStats = {
        totalRuns: pipelineRuns.length,
        completed: pipelineRuns.filter(r => r.status === 'completed').length,
        failed: pipelineRuns.filter(r => r.status === 'failed').length,
        running: pipelineRuns.filter(r => r.status === 'running').length,
        waitingApproval: pipelineRuns.filter(r => r.status === 'waiting_approval').length,
        rejected: pipelineRuns.filter(r => r.status === 'rejected').length,
        cancelled: pipelineRuns.filter(r => r.status === 'cancelled').length,
        interrupted: pipelineRuns.filter(r => r.status === 'interrupted').length,
      };

      const activityBreakdown = {
        total: events.length,
        info: events.filter(e => e.level === 'info').length,
        success: events.filter(e => e.level === 'success').length,
        warning: events.filter(e => e.level === 'warning').length,
        error: events.filter(e => e.level === 'error').length,
      };

      json(res, 200, {
        object: 'conduit.analytics_overview',
        generatedAt: Date.now(),
        totals: {
          requests: totalRequests,
          successes: totalSuccesses,
          errors: totalErrors,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          tokens: totalTokens,
          costUsd: Math.round(totalCostUsd * 1e6) / 1e6,
          avgLatencyMs,
        },
        models: modelStats.sort((a, b) => b.requests - a.requests),
        pipelines: pipelineStats,
        budget: budgetStatus,
        activity: activityBreakdown,
        governance: {
          repositoriesCount: repositories.length,
          auditRecordsCount: auditTrail.length,
          recentAudits: auditTrail.slice(0, 10),
        },
      });
      return;
    }

    if (path === '/v1/pipelines' && method === 'GET') {
      json(res, 200, { object: 'list', data: this._pipelineStore.listPipelines() });
      return;
    }

    if (path === '/v1/pipelines' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      if (!data?.name || !Array.isArray(data?.steps) || data.steps.length === 0) {
        json(res, 400, { error: { message: 'Pipeline requires a name and at least one step', type: 'invalid_request' } });
        return;
      }
      const id = typeof data.id === 'string' && data.id.trim()
        ? data.id.trim()
        : `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const pipeline: PipelineDefinition = {
        id,
        name: String(data.name).trim(),
        description: String(data.description || '').trim(),
        steps: data.steps.map((s: any, idx: number) => ({
          id: String(s.id || `step-${idx + 1}`),
          name: String(s.name || `Step ${idx + 1}`),
          model: String(s.model || 'cli-claude/claude-sonnet-5'),
          mode: ['chat', 'plan', 'agent'].includes(s.mode) ? s.mode : 'chat',
          promptTemplate: typeof s.promptTemplate === 'string' ? s.promptTemplate : undefined,
          requiresApproval: Boolean(s.requiresApproval),
          dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : undefined,
          parallelGroup: typeof s.parallelGroup === 'string' ? s.parallelGroup : undefined,
          max_tokens: s.max_tokens,
          effort: s.effort, fastMode: s.fastMode,
        })),
        isBuiltIn: false,
        category: typeof data.category === 'string' ? data.category : 'custom',
        repository: typeof data.repository === 'string' ? data.repository : undefined,
      };
      try {
        const saved = this._pipelineStore.savePipeline(pipeline);
        this._activity.add('success', 'pipeline', `Saved pipeline: ${saved.name}`);
        json(res, 200, { status: 'saved', pipeline: saved });
      } catch (err) {
        json(res, 400, { error: { message: (err as Error).message, type: 'invalid_request' } });
      }
      return;
    }

    if (path.startsWith('/v1/pipelines/') && method === 'DELETE') {
      const pipelineId = path.slice('/v1/pipelines/'.length);
      if (!pipelineId) {
        json(res, 400, { error: { message: 'Pipeline id required', type: 'invalid_request' } });
        return;
      }
      const deleted = this._pipelineStore.deletePipeline(pipelineId);
      if (!deleted) {
        json(res, 404, { error: { message: `Pipeline not found: ${pipelineId}`, type: 'not_found' } });
        return;
      }
      this._activity.add('info', 'pipeline', `Deleted pipeline: ${pipelineId}`);
      json(res, 200, { status: 'deleted', id: pipelineId });
      return;
    }

    if (path === '/v1/pipelines/run' && method === 'POST') {
      if (!this._limit(req, res)) return;
      const activeLimit = this._cfg.rateLimit?.maxConcurrent ?? 16;
      if (this._pipelineExecutions.size >= activeLimit) {
        json(res, 429, { error: { message: 'Too many pipeline runs are already executing', type: 'rate_limit_error' } });
        return;
      }
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      const pipelineId = typeof data?.pipelineId === 'string' ? data.pipelineId : '';
      const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
      if (!pipelineId) {
        json(res, 400, { error: { message: 'pipelineId is required', type: 'invalid_request' } });
        return;
      }
      if (!prompt) {
        json(res, 400, { error: { message: 'prompt is required', type: 'invalid_request' } });
        return;
      }
      if (prompt.length > MAX_PIPELINE_PROMPT_CHARS) {
        json(res, 400, { error: { message: `prompt must not exceed ${MAX_PIPELINE_PROMPT_CHARS} characters`, type: 'invalid_request' } });
        return;
      }
      const pipeline = this._pipelineStore.getPipeline(pipelineId);
      if (!pipeline) {
        json(res, 404, { error: { message: `Pipeline not found: ${pipelineId}`, type: 'not_found' } });
        return;
      }

      const explicitRepo = typeof data?.repository === 'string' && data.repository.trim()
        ? this._governanceManager.getRepository(data.repository)
        : undefined;
      const pipelineRepo = pipeline.repository ? this._governanceManager.getRepository(pipeline.repository) : undefined;
      if ((data?.repository && !explicitRepo) || (pipeline.repository && !pipelineRepo)) {
        json(res, 404, { error: { message: 'Requested pipeline repository is not registered', type: 'not_found' } });
        return;
      }
      if (explicitRepo && pipelineRepo && explicitRepo.id !== pipelineRepo.id) {
        json(res, 403, { error: { message: 'Pipeline is assigned to a different repository', type: 'permission_denied' } });
        return;
      }
      const requestedWorkingDirectory = typeof data?.workingDirectory === 'string' ? data.workingDirectory : undefined;
      const inferredRepo = requestedWorkingDirectory ? this._governanceManager.findRepositoryForPath(requestedWorkingDirectory) : undefined;
      const repository = explicitRepo ?? pipelineRepo ?? inferredRepo;
      if (repository?.enabledPipelines !== undefined && !Array.isArray(repository.enabledPipelines)) {
        json(res, 400, { error: { message: `Repository '${repository.id}' has an invalid pipeline allowlist`, type: 'invalid_request' } });
        return;
      }
      if (repository?.enabledPipelines && !repository.enabledPipelines.includes(pipeline.id)) {
        json(res, 403, { error: { message: `Pipeline '${pipeline.id}' is not enabled for repository '${repository.id}'`, type: 'permission_denied' } });
        return;
      }
      const working = this._workspaceManager.resolveWorkingDirectory(
        requestedWorkingDirectory ?? repository?.defaultWorkspace ?? repository?.path,
        repository ? [repository.path, ...(repository.defaultWorkspace ? [repository.defaultWorkspace] : [])] : [],
        !repository,
      );
      if (!working.ok || !working.path) {
        json(res, 400, { error: { message: working.error, type: 'invalid_request' } });
        return;
      }
      const operator = typeof data?.operator === 'string' && /^[A-Za-z0-9._@ -]{1,100}$/.test(data.operator.trim()) ? data.operator.trim() : 'operator';
      const effectivePipeline = structuredClone(pipeline);
      if (repository?.overrides?.mandatoryGates !== undefined && !Array.isArray(repository.overrides.mandatoryGates)) {
        json(res, 400, { error: { message: `Repository '${repository.id}' has invalid mandatoryGates`, type: 'invalid_request' } });
        return;
      }
      const mandatoryGates = repository?.overrides?.mandatoryGates ?? [];
      if (mandatoryGates.some(id => !effectivePipeline.steps.some(step => step.id === id))) {
        json(res, 400, { error: { message: 'Repository mandatoryGates references an unknown pipeline step', type: 'invalid_request' } });
        return;
      }
      for (const step of effectivePipeline.steps) {
        if (mandatoryGates.includes(step.id) || (repository?.overrides?.requireApproval && step.mode === 'agent')) step.requiresApproval = true;
      }
      if (repository?.overrides?.requireApproval && !effectivePipeline.steps.some(step => step.requiresApproval)) {
        effectivePipeline.steps[effectivePipeline.steps.length - 1].requiresApproval = true;
      }
      const correlationId = randomUUID();
      res.setHeader('X-Correlation-ID', correlationId);
      try {
        const accepted = this._launchPipeline(effectivePipeline, prompt, {
          repository: repository?.id,
          workingDirectory: working.path,
          correlationId,
          operator,
          overrides: repository?.overrides,
        });
        json(res, 202, { status: 'accepted', run: accepted });
      } catch (err) {
        this._activity.add('error', 'pipeline', `Execution setup error: ${(err as Error).message}`, { traceId: correlationId, status: 'failed' });
        json(res, 400, { error: { message: (err as Error).message, type: 'pipeline_execution_error' } });
      }
      return;
    }

    if (path === '/v1/pipelines/runs' && method === 'GET') {
      json(res, 200, { object: 'list', data: this._pipelineStore.listRuns() });
      return;
    }

    const pipelineRunDetail = path.match(/^\/v1\/pipelines\/runs\/([^/]+)$/);
    if (pipelineRunDetail && method === 'GET') {
      const runId = decodeURIComponent(pipelineRunDetail[1]);
      const run = this._pipelineStore.getRun(runId);
      if (!run) {
        json(res, 404, { error: { message: `Pipeline run not found: ${runId}`, type: 'not_found' } });
        return;
      }
      json(res, 200, { run });
      return;
    }

    if (path === '/v1/pipelines/runs/action' && method === 'POST') {
      const body = await readBody(req);
      let data: any;
      try { data = JSON.parse(body); } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }
      const { runId, action, stepId } = data || {};
      const feedback = typeof data?.feedback === 'string' ? data.feedback.slice(0, 2000) : undefined;
      if (typeof runId !== 'string' || !runId || typeof action !== 'string' || !action) {
        json(res, 400, { error: { message: 'runId and action (approve | reject | cancel) required', type: 'invalid_request' } });
        return;
      }
      if (!['approve', 'reject', 'cancel'].includes(action)) {
        json(res, 400, { error: { message: `Unknown action: ${action}`, type: 'invalid_request' } });
        return;
      }
      const storedRun = this._pipelineStore.getRun(runId);
      if (!storedRun) {
        json(res, 404, { error: { message: `Pipeline run not found: ${runId}`, type: 'not_found' } });
        return;
      }
      const run = structuredClone(storedRun);
      if (action === 'cancel') {
        if (!['running', 'waiting_approval'].includes(run.status)) {
          json(res, 400, { error: { message: `Run cannot be cancelled from status '${run.status}'`, type: 'invalid_state' } });
          return;
        }
        this._pipelineControllers.get(run.id)?.abort(new Error('Cancelled by operator'));
        const cancelled: PipelineRun = { ...run, status: 'cancelled', error: 'Cancelled by operator', completedAt: Date.now() };
        for (const result of Object.values(cancelled.stepResults)) {
          if (result.status === 'running' || result.status === 'waiting_approval') {
            result.status = 'failed';
            result.error = cancelled.error;
            result.completedAt = cancelled.completedAt;
          }
        }
        this._pipelineStore.recordRun(cancelled);
        this._budgetManager.finishRun(cancelled.id);
        this._activity.add('warning', 'pipeline', `Run ${run.id} cancelled by operator`, {
          traceId: run.correlationId, runId: run.id, status: 'cancelled',
        });
        json(res, 200, { status: cancelled.status, run: cancelled });
        return;
      }
      if (run.status !== 'waiting_approval') {
        json(res, 400, { error: { message: `Run is not waiting for approval (current status: ${run.status})`, type: 'invalid_state' } });
        return;
      }
      if (!run.definition) {
        json(res, 409, { error: { message: 'Legacy run cannot be resumed safely; start a new run', type: 'invalid_state' } });
        return;
      }
      const targetStepId = stepId || run.pendingApprovalStepId;
      if (!targetStepId || targetStepId !== run.pendingApprovalStepId) {
        json(res, 400, { error: { message: 'stepId must match the pending approval checkpoint', type: 'invalid_request' } });
        return;
      }
      const operator = typeof data?.operator === 'string' && /^[A-Za-z0-9._@ -]{1,100}$/.test(data.operator.trim()) ? data.operator.trim() : 'operator';

      if (action === 'reject') {
        run.status = 'rejected';
        run.approvalFeedback = feedback || 'Rejected by operator';
        if (run.pendingApprovalStepId && run.stepResults[run.pendingApprovalStepId]) {
          run.stepResults[run.pendingApprovalStepId].status = 'rejected';
          run.stepResults[run.pendingApprovalStepId].error = run.approvalFeedback;
        }
        if (run.pendingApprovalStepId) {
          this._governanceManager.recordAudit({
            repository: run.repository,
            pipelineId: run.pipelineId,
            pipelineName: run.pipelineName,
            stepId: run.pendingApprovalStepId,
            stepName: run.stepResults[run.pendingApprovalStepId]?.stepName || run.pendingApprovalStepId,
            action: 'rejected',
            operator,
            feedback: run.approvalFeedback,
            runId: run.id,
            correlationId: run.correlationId,
          });
        }
        run.completedAt = Date.now();
        run.pendingApprovalStepId = undefined;
        this._pipelineStore.recordRun(run);
        this._budgetManager.finishRun(run.id);
        this._activity.add('warning', 'pipeline', `Run ${runId} rejected by operator`, {
          traceId: run.correlationId, runId: run.id, stepId: targetStepId, status: 'rejected',
        });
        json(res, 200, { status: 'rejected', run });
        return;
      }

      if (action === 'approve') {
        const activeLimit = this._cfg.rateLimit?.maxConcurrent ?? 16;
        if (this._pipelineExecutions.size >= activeLimit) {
          json(res, 429, { error: { message: 'Too many pipeline runs are already executing', type: 'rate_limit_error' } });
          return;
        }
        this._activity.add('info', 'pipeline', `Step ${targetStepId} approved, resuming run ${runId}`, {
          traceId: run.correlationId, runId: run.id, stepId: targetStepId, status: 'running',
        });
        try {
          const repository = run.repository ? this._governanceManager.getRepository(run.repository) : undefined;
          if (run.repository && !repository) throw new Error('Run repository is no longer registered');
          const working = this._workspaceManager.resolveWorkingDirectory(
            run.workingDirectory,
            repository ? [repository.path, ...(repository.defaultWorkspace ? [repository.defaultWorkspace] : [])] : [],
            !repository,
          );
          if (!working.ok || !working.path) throw new Error(working.error);
          const updatedRun = this._launchPipeline(run.definition, run.initialPrompt, {
            repository: run.repository,
            workingDirectory: working.path,
            correlationId: run.correlationId || randomUUID(),
            operator,
            overrides: repository?.overrides,
            existingRun: run,
            approvedStepId: targetStepId,
          });
          json(res, 202, { status: 'accepted', run: updatedRun });
        } catch (err) {
          this._activity.add('error', 'pipeline', `Resume error: ${(err as Error).message}`, {
            traceId: run.correlationId, runId: run.id, stepId: targetStepId, status: 'failed',
          });
          json(res, 400, { error: { message: (err as Error).message, type: 'pipeline_execution_error' } });
        }
        return;
      }

      json(res, 400, { error: { message: `Unknown action: ${action}`, type: 'invalid_request' } });
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

    // ── /v1/chat/sessions ───────────────────────────────────────────────────
    if (path === '/v1/chat/sessions' && method === 'POST') {
      const body = await readBody(req);
      let parsed: any = {};
      try { if (body.trim()) parsed = JSON.parse(body); } catch {}
      await this._platform.start();
      const session = await this._platform.content.createSession({
        title: parsed.title || 'Interactive Chat',
        model: parsed.model,
        workspaceId: parsed.workspaceId || 'default',
        retention: 'retained',
      });
      json(res, 201, {
        id: session.id,
        model: session.model || parsed.model || 'gpt-4o',
        title: session.title,
        createdAt: session.createdAt,
        messages: session.messages || [],
      });
      return;
    }

    if (path === '/v1/chat/sessions' && method === 'GET') {
      await this._platform.start();
      const sessions = this._platform.content.listSessions().map(s => ({
        id: s.id,
        title: s.title,
        model: s.model,
        updatedAt: s.updatedAt,
        messages: s.messages || [],
      }));
      json(res, 200, { data: sessions });
      return;
    }

    if (path.startsWith('/v1/chat/sessions/') && !path.endsWith('/cancel') && method === 'GET') {
      const sessionId = decodeURIComponent(path.slice('/v1/chat/sessions/'.length));
      await this._platform.start();
      const session = this._platform.content.getSession(sessionId);
      if (!session) {
        json(res, 404, { error: { message: `Session ${sessionId} not found`, type: 'not_found' } });
        return;
      }
      json(res, 200, {
        id: session.id,
        title: session.title,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages || [],
        data: session,
      });
      return;
    }

    if (path.startsWith('/v1/chat/sessions/') && path.endsWith('/cancel') && method === 'POST') {
      const sessionId = decodeURIComponent(path.slice('/v1/chat/sessions/'.length, -'/cancel'.length));
      await this._platform.start();
      this._platform.content.cancelTurn(sessionId);
      json(res, 200, { cancelled: true });
      return;
    }

    // ── /v1/runs ────────────────────────────────────────────────────────────
    if (path === '/v1/runs' && method === 'GET') {
      await this._platform.start();
      const runs = this._platform.runs.list();
      json(res, 200, { runs, data: runs });
      return;
    }

    if (path === '/v1/runs' && method === 'POST') {
      const body = await readBody(req);
      let parsed: any = {};
      try { if (body.trim()) parsed = JSON.parse(body); } catch {}
      await this._platform.start();
      const run = await this._platform.runs.create(parsed);
      json(res, 201, run);
      return;
    }

    if (path.startsWith('/v1/runs/') && !path.slice('/v1/runs/'.length).includes('/') && method === 'GET') {
      const runId = decodeURIComponent(path.slice('/v1/runs/'.length));
      await this._platform.start();
      const run = this._platform.runs.get(runId);
      if (!run) {
        json(res, 404, { error: { message: `Run ${runId} not found`, type: 'not_found' } });
        return;
      }
      json(res, 200, { run, data: run });
      return;
    }

    if (path.startsWith('/v1/runs/') && method === 'POST') {
      const segments = path.slice('/v1/runs/'.length).split('/');
      if (segments.length === 2) {
        const runId = decodeURIComponent(segments[0]);
        const action = segments[1];
        if (['approve', 'cancel', 'retry', 'continue'].includes(action)) {
          const body = await readBody(req);
          let parsed: any = {};
          try { if (body.trim()) parsed = JSON.parse(body); } catch {}
          await this._platform.start();
          await this._platform.runs.action(runId, action as any, 'cli-operator', parsed.feedback);
          json(res, 200, { success: true, action, id: runId });
          return;
        }
      }
    }

    // ── /v1/insights ────────────────────────────────────────────────────────
    if (path === '/v1/insights' && method === 'GET') {
      await this._platform.start();
      const view = this._platform.insights.view('local-admin', 'cli-version');
      const summaries = (view as any)?.summaries || [];
      json(res, 200, { insights: summaries, data: summaries });
      return;
    }

    // ── /v1/git & /v1/workspaces/:id/git ────────────────────────────────────
    if ((path === '/v1/git' || (path.startsWith('/v1/workspaces/') && path.endsWith('/git'))) && method === 'GET') {
      let wsId: string | undefined;
      if (path.startsWith('/v1/workspaces/')) {
        wsId = decodeURIComponent(path.slice('/v1/workspaces/'.length, -'/git'.length));
      }
      const workspaceList = this._workspaceManager.listWorkspaces();
      const workspace = wsId ? workspaceList.find(w => w.id === wsId) : (workspaceList[0] || { id: 'default', path: process.cwd() });
      const targetDir = workspace?.path || process.cwd();
      try {
        const gitService = new GitWorkspaceService(targetDir);
        const snapshot = await gitService.snapshot();
        json(res, 200, {
          detected: Boolean(snapshot.detected),
          branch: snapshot.branch || '',
          files: snapshot.files?.length || 0,
          name: snapshot.name || '',
        });
      } catch {
        json(res, 200, { detected: false, branch: '', files: 0, name: '' });
      }
      return;
    }

    // ── /v1/system/status ───────────────────────────────────────────────────
    if (path === '/v1/system/status' && method === 'GET') {
      const providers = this._registry.allModels().reduce<Array<{ name: string; connected: boolean }>>((acc, m) => {
        if (!acc.some(p => p.name === m.provider)) {
          acc.push({ name: m.provider, connected: true });
        }
        return acc;
      }, []);
      json(res, 200, { version: PKG_VERSION, providers });
      return;
    }

    // ── POST /v1/chat/completions ────────────────────────────────────────────
    if (path === '/v1/chat/completions' && method === 'POST') {
      const traceId = randomUUID();
      const accountingRunId = `chat-${traceId}`;
      const requestStartedAt = Date.now();
      res.setHeader('X-Correlation-ID', traceId);
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
        if (!res.writableEnded) this._activity.add('warning', 'request', 'Client disconnected, cancelling ' + model, {
          traceId, model: typeof model === 'string' ? model : undefined, status: 'cancelled', durationMs: Date.now() - requestStartedAt,
        });
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

      let selectedModel = model;
      let provider = this._registry.providerForModel(selectedModel);
      if (!provider) {
        json(res, 404, { error: { message: `Unknown model: ${model}`, type: 'invalid_request' } });
        return;
      }

      const cwd = typeof req_data.cwd === 'string' ? req_data.cwd : undefined;
      const requestForProvider = (candidateProvider: NonNullable<typeof provider>, candidateModel: string) => {
        const policy = this._cfg.agentPolicies?.[candidateProvider.name];
        const parsed = parseCliRunMode(req_data, policy?.defaultMode || 'chat');
        if (!parsed.ok) return { ok: false as const, status: 400, message: parsed.error, type: 'invalid_request' };
        if (parsed.mode === 'agent' && policy?.agentEnabled === false) {
          return {
            ok: false as const,
            status: 403,
            message: `Agent mode is disabled for provider '${candidateProvider.name}' in bridge settings`,
            type: 'permission_denied',
          };
        }
        const candidateCwdError = agentModeCwdError(parsed.mode, cwd);
        if (candidateCwdError) return { ok: false as const, status: 400, message: candidateCwdError, type: 'invalid_request' };
        const allowUnconfined = req_data.allowUnconfined === true
          || policy?.allowUnconfined === true
          || this._cfg.allowUnconfined === true;
        const candidateConfinementError = agentConfinementError(candidateProvider.name, parsed.mode, { allowUnconfined });
        if (candidateConfinementError) {
          return {
            ok: false as const,
            status: 403,
            message: candidateConfinementError,
            type: 'permission_denied',
          };
        }
        return {
          ok: true as const,
          request: {
            model: candidateModel,
            messages,
            temperature,
            max_tokens,
            effort, fastMode: parseFastMode(req_data.fastMode),
            cwd,
            mode: parsed.mode,
            allowUnconfined,
            disallowedTools: policy?.disallowedTools,
            signal: requestAbort.signal,
          },
        };
      };
      const initialRequest = requestForProvider(provider, selectedModel);
      if (!initialRequest.ok) {
        this._activity.add('warning', provider.name, initialRequest.message, { traceId, provider: provider.name, model: selectedModel, status: 'rejected' });
        json(res, initialRequest.status, { error: { message: initialRequest.message, type: initialRequest.type } });
        return;
      }

      if (!this._limit(req, res)) return;

      // Resolve the selected API credential or local CLI/process state.
      const candidates = [model, ...(Array.isArray(req_data.fallback_models) ? req_data.fallback_models : []), ...this._orchestrator.fallbackModels];
      let connected = candidates.length > 1 ? await provider.checkSession() : await provider.ensureConnected();
      for (const candidate of candidates) {
        if (connected) break;
        const fallback = this._registry.providerForModel(candidate);
        if (!fallback) continue;
        const fallbackRequest = requestForProvider(fallback, candidate);
        if (!fallbackRequest.ok) {
          this._activity.add('warning', fallback.name, `Fallback skipped by policy: ${fallbackRequest.message}`, {
            traceId, provider: fallback.name, model: candidate, status: 'rejected', attempt: candidates.indexOf(candidate) + 1,
          });
          continue;
        }
        const fallbackConnected = candidates.indexOf(candidate) < candidates.length - 1 ? await fallback.checkSession() : await fallback.ensureConnected();
        if (fallbackConnected) {
          selectedModel = candidate;
          provider = fallback;
          connected = true;
          this._activity.add('warning', 'router', 'Fallback selected: ' + candidate, {
            traceId, provider: fallback.name, model: candidate, status: 'running', attempt: candidates.indexOf(candidate) + 1,
          });
        }
      }
      if (!connected) {
        this._activity.add('warning', provider.name, 'Request blocked because provider is not connected', {
          traceId, provider: provider.name, model: selectedModel, status: 'failed', durationMs: Date.now() - requestStartedAt,
        });
        json(res, 503, { error: { message: `${provider.name} is not connected. Configure its API credential or authenticate the local CLI.`, type: 'provider_unavailable' } });
        return;
      }

      const selectedRequest = requestForProvider(provider, selectedModel);
      if (!selectedRequest.ok) {
        json(res, selectedRequest.status, { error: { message: selectedRequest.message, type: selectedRequest.type } });
        return;
      }
      const chatReq = selectedRequest.request;

      if (stream) {
        let accounting;
        try {
          accounting = openExecution(provider, chatReq, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
        } catch (error) {
          this._budgetManager.finishRun(accountingRunId);
          const budget = error instanceof BudgetExceededError;
          json(res, budget ? 402 : 400, { error: { message: (error as Error).message, type: budget ? 'budget_exceeded' : 'invalid_request' } });
          return;
        }
        const id = `chatcmpl-${Date.now()}`;
        const earlyEvents: ExecutionEvent[] = [];
        let streamHeaderSent = false;
        const emitExecutionEvent = (event: ExecutionEvent, currentModel = selectedModel) => {
          if (res.writableEnded || res.destroyed) return;
          if (!streamHeaderSent) {
            earlyEvents.push(event);
            return;
          }
          const eventChunk = JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            model: currentModel,
            choices: [],
            executionEvent: event,
          });
          res.write(`data: ${eventChunk}\n\n`);
        };
        accounting.request.onExecutionEvent = ev => emitExecutionEvent(ev, selectedModel);
        let streamIterator: AsyncGenerator<string> = provider.chatStream(accounting.request);
        let firstChunk: IteratorResult<string> = { done: true, value: undefined };
        try {
          firstChunk = await streamIterator.next();
        } catch (primaryError) {
          accounting.finish('', primaryError);
          let recovered = false;
          for (const candidate of candidates.slice(1)) {
            const fallback = this._registry.providerForModel(candidate);
            if (!fallback || !(await fallback.checkSession())) continue;
            const fallbackRequest = requestForProvider(fallback, candidate);
            if (!fallbackRequest.ok) continue;
            let fallbackAccounting;
            try {
              fallbackAccounting = openExecution(fallback, fallbackRequest.request, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
              fallbackAccounting.request.onExecutionEvent = ev => emitExecutionEvent(ev, candidate);
              streamIterator = fallback.chatStream(fallbackAccounting.request);
              firstChunk = await streamIterator.next();
              accounting = fallbackAccounting;
              selectedModel = candidate;
              provider = fallback;
              recovered = true;
              this._activity.add('warning', 'router', 'Streaming primary failed, fallback selected: ' + candidate, {
                traceId, provider: fallback.name, model: candidate, status: 'running', attempt: candidates.indexOf(candidate) + 1,
              });
              break;
            } catch (fallbackError) {
              fallbackAccounting?.finish('', fallbackError);
            }
          }
          if (!recovered) {
            this._budgetManager.finishRun(accountingRunId);
            const budget = primaryError instanceof BudgetExceededError;
            json(res, budget ? 402 : 503, { error: { message: (primaryError as Error).message, type: budget ? 'budget_exceeded' : 'provider_error' } });
            return;
          }
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        streamHeaderSent = true;
        for (const ev of earlyEvents) emitExecutionEvent(ev, selectedModel);
        let streamedText = firstChunk.done ? '' : (firstChunk.value ?? '');
        let streamFailed = false;
        try {
          if (streamedText.length > accounting.maxOutputChars) {
            streamedText = streamedText.slice(0, accounting.maxOutputChars);
            requestAbort.abort(new Error('Provider output exceeds the configured character limit'));
            throw new Error(`Provider output exceeds ${accounting.maxOutputChars} character limit`);
          }
          if (!firstChunk.done && firstChunk.value) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: selectedModel, choices: [{ index: 0, delta: { content: firstChunk.value }, finish_reason: null }] })}\n\n`);
          for await (const chunk of streamIterator) {
            streamedText += chunk;
            if (streamedText.length > accounting.maxOutputChars) {
              streamedText = streamedText.slice(0, accounting.maxOutputChars);
              requestAbort.abort(new Error('Provider output exceeds the configured character limit'));
              throw new Error(`Provider output exceeds ${accounting.maxOutputChars} character limit`);
            }
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
          accounting.finish(streamedText);
        } catch (err) {
          streamFailed = true;
          accounting.finish(streamedText, err);
          this._activity.add('error', provider.name, 'Streaming request failed through ' + model + ': ' + (err as Error).message.replace(/\s+/g, ' ').slice(0, 240), {
            traceId, provider: provider.name, model: selectedModel, status: 'failed', durationMs: Date.now() - requestStartedAt,
          });
          const errData = JSON.stringify({ error: (err as Error).message });
          res.write(`data: ${errData}\n\n`);
        }
        if (!streamFailed && !requestAbort.signal.aborted) this._activity.add('success', provider.name, 'Completed streaming request through ' + selectedModel, {
          traceId, provider: provider.name, model: selectedModel, status: 'completed', durationMs: Date.now() - requestStartedAt,
        });
        this._budgetManager.finishRun(accountingRunId);
        res.end();
      } else {
        try {
          let content = '';
          try {
            content = await executeWithAccounting(provider, chatReq, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
          } catch (primaryError) {
            let recovered = false;
            for (const candidate of candidates.slice(1)) {
              const fallback = this._registry.providerForModel(candidate);
              if (!fallback || !(await fallback.checkSession())) continue;
              const fallbackRequest = requestForProvider(fallback, candidate);
              if (!fallbackRequest.ok) continue;
              try {
                content = await executeWithAccounting(fallback, fallbackRequest.request, { budgetManager: this._budgetManager, metrics: this._metrics, runId: accountingRunId });
                selectedModel = candidate;
                provider = fallback;
                recovered = true;
                this._activity.add('warning', 'router', 'Primary request failed, fallback completed through ' + candidate, {
                  traceId, provider: fallback.name, model: candidate, status: 'completed', attempt: candidates.indexOf(candidate) + 1,
                });
                break;
              } catch (fallbackError) {
                this._activity.add('warning', 'router', 'Fallback failed through ' + candidate, {
                  traceId, provider: fallback.name, model: candidate, status: 'failed', attempt: candidates.indexOf(candidate) + 1,
                });
              }
            }
            if (!recovered) throw primaryError;
          }
          const inputTokens = estimateTokens(messages);
          const outputTokens = estimateTokens([{ content }]);
          this._activity.add('success', provider.name, 'Completed request through ' + selectedModel, {
            traceId, provider: provider.name, model: selectedModel, status: 'completed', durationMs: Date.now() - requestStartedAt,
          });
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
          this._activity.add('error', provider.name, 'Request failed through ' + selectedModel + ': ' + (err as Error).message.replace(/\s+/g, ' ').slice(0, 240), {
            traceId, provider: provider.name, model: selectedModel, status: 'failed', durationMs: Date.now() - requestStartedAt,
          });
          const budget = err instanceof BudgetExceededError;
          json(res, budget ? 402 : 503, { error: { message: (err as Error).message, type: budget ? 'budget_exceeded' : 'provider_error' } });
        }
        this._budgetManager.finishRun(accountingRunId);
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

function rejectWebSocketUpgrade(socket: Duplex, status: 400 | 401, reason: 'Bad Request' | 'Unauthorized'): void {
  try {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch { socket.destroy(); }
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
    let bytes = 0;
    req.on('data', chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_REQUEST_BODY_BYTES) {
        reject(new RequestBodyTooLargeError());
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function estimateTokens(messages: Array<{ content: string }>): number {
  return Math.max(1, Math.ceil(messages.reduce((n, message) => n + message.content.length, 0) / 4));
}
