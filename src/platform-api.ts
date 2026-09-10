import { parseFastMode } from './fast-mode.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { BridgeConfig, ChatRequest, ModelDefinition, ProviderName, WorkspaceEntry, SecretReference, ExecutionEvent } from './types.js';
import { runtimeDir, saveConfig, secureStorageStatus } from './config.js';
import { createContentCipher, openSecretVault, type ContentCipher } from './secrets.js';
import { FileSnapshotBackend, SqliteSnapshotBackend, TransactionalStateStore, type SnapshotCodec } from './storage.js';
import { PlatformContentService, PlatformContentError, type ContextInput, type PlatformSession, type PlatformMemory } from './platform-content.js';
import { PlatformVaultService, VAULT_SUGGESTION_SCHEMA } from './platform-vault.js';
import { PlatformInsightsService } from './platform-insights.js';
import { PlatformCatalogService } from './platform-catalog.js';
import { PlatformProfileService, type PlatformProviderProfile } from './platform-profiles.js';
import { PlatformRunService, type PlatformRun, type PlatformRunInput } from './platform-runs.js';
import { authenticatePlatformOperator, requirePlatformCapability, platformCapabilityAllowed, createPlatformOperatorCredential, type PlatformOperatorContext, type PlatformCapability } from './platform-auth.js';
import { KNOWN_TOOLS, normalizeDisallowedTools, agentConfinementError } from './cli-mode.js';
import { capabilitiesFor } from './model-capability.js';
import { redactSecrets } from './redact.js';
import { buildCodingPipelines } from './platform-presets.js';
import { GitWorkspaceService } from './git-workspace.js';

export interface PlatformExecutionContext {
  /** Present only for conversations with explicit retained history. */
  sessionId?: string;
  runId?: string;
  profile?: PlatformProviderProfile;
  repository?: string;
  workspaceId?: string;
  operator: PlatformOperatorContext;
  fallbackModels?: string[];
  onDelta?: (delta: string) => void;
  onExecutionEvent?: (event: ExecutionEvent) => void;
  onFallbackModelUsed?: (fallbackModel: string) => void;
}
export interface PlatformApiDependencies {
  cfg(): BridgeConfig;
  models(): ModelDefinition[];
  providerForModel(model: string): ProviderName | undefined;
  workspaces(): WorkspaceEntry[];
  resolveWorkspace(workspaceId?: string, cwd?: string, repository?: string): { cwd?: string; workspaceId?: string; repository?: string; requiresApproval?: boolean; maxCostUsd?: number };
  execute(request: ChatRequest, context: PlatformExecutionContext): Promise<string>;
  diagnostics(): Promise<unknown[]>;
  acquire(): (() => void) | undefined;
  begin(run: PlatformRun): void;
  finish(run: PlatformRun): void;
  spend(id: string): { costUsd: number; tokens: number };
  event(event: Record<string, unknown>): void;
  saveConfig?(config: Partial<BridgeConfig>): void;
  installPipeline?(definition: unknown): unknown;
}

function response(res: ServerResponse, status: number, value: unknown): void {
  const payload = JSON.stringify(value); res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(payload) }); res.end(payload);
}
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlatformContentError('A JSON object is required');
  return value as Record<string, any>;
}
function operatorForOwner(id: string | undefined, cfg: BridgeConfig): PlatformOperatorContext {
  if (id === 'local-admin') return { operatorId: 'local-admin', displayName: 'Local administrator', role: 'admin', workspaceIds: ['*'], source: 'bridge-token' };
  const matches = cfg.platformAuth?.operators?.filter(o => o.id === id && o.enabled !== false) ?? [];
  if (matches.length !== 1) throw new PlatformContentError('The run owner is no longer authorized', 403);
  const found = matches[0];
  return { operatorId: found.id, displayName: found.displayName || found.id, role: found.role, workspaceIds: found.workspaceIds ?? [], source: 'operator-token' };
}
function globalWorkspace(id?: string): string | undefined { return id === 'default' || !id ? undefined : id; }
function publicRun(run: PlatformRun): Omit<PlatformRun, 'input'> & { input: Omit<PlatformRunInput, 'authorizationVersion'> } {
  const { authorizationVersion: _authorizationVersion, ...input } = run.input;
  return { ...run, input };
}
function authorizationVersion(operator: PlatformOperatorContext, cfg: BridgeConfig): string {
  const material = operator.operatorId === 'local-admin' ? `bridge:${cfg.authToken || 'loopback-no-auth'}` : cfg.platformAuth?.operators?.find(o => o.id === operator.operatorId)?.tokenHash || 'revoked';
  return createHash('sha256').update('conduit-queued-authorization-v1\0').update(material).digest('hex');
}

export class PlatformApi {
  readonly store: TransactionalStateStore;
  readonly content: PlatformContentService;
  readonly catalog: PlatformCatalogService;
  readonly profiles: PlatformProfileService;
  readonly runs: PlatformRunService;
  readonly vault: PlatformVaultService;
  readonly insights: PlatformInsightsService;
  private readonly codec: SnapshotCodec;
  private initError?: Error;
  private started?: Promise<void>;
  private sessionControllers = new Map<string, AbortController>();

  constructor(private deps: PlatformApiDependencies, store?: TransactionalStateStore) {
    let cipher: ContentCipher | undefined;
    const cipherForUse = () => cipher ??= createContentCipher({ purpose: 'platform-state', directory: runtimeDir(), keyEnvironmentVariable: deps.cfg().securityStorage?.vaultKeyEnvironmentVariable, keyId: deps.cfg().securityStorage?.vaultKeyId });
    this.codec = { seal: (text, context) => cipherForUse().seal(text, context), open: (text, context) => cipherForUse().open(text, context) };
    const config = deps.cfg().platformStorage;
    if (store) this.store = store;
    else if (config?.backend === 'memory') throw new Error('Conversations require durable storage; choose sqlite or file');
    else if (!config?.backend || config.backend === 'sqlite') this.store = new TransactionalStateStore(new SqliteSnapshotBackend(config?.path || join(runtimeDir(), 'platform.sqlite'), this.codec, !config?.path ? join(runtimeDir(), 'platform-state.enc') : undefined));
    else if (config?.backend === 'prisma') throw new Error('Prisma storage requires an injected PrismaSnapshotBackend/TransactionalStateStore; see examples/storage');
    else this.store = new TransactionalStateStore(new FileSnapshotBackend(config?.path || join(runtimeDir(), 'platform-state.enc'), this.codec));
    this.content = new PlatformContentService(this.store);
    this.catalog = new PlatformCatalogService(this.store);
    this.profiles = new PlatformProfileService(this.store);
    this.vault = new PlatformVaultService(this.store, {
      directory: join(runtimeDir(), 'vault-search'),
      sessions: (ownerId, version) => {
        const operator = operatorForOwner(ownerId, deps.cfg());
        if (authorizationVersion(operator, deps.cfg()) !== version) throw new PlatformContentError('Vault scan authorization has changed', 403);
        requirePlatformCapability(operator, 'operate');
        return this.visibleSessions(operator).filter(s => s.userId === ownerId);
      },
      analyze: async (ownerId, version, prompt, signal) => {
        const operator = operatorForOwner(ownerId, deps.cfg());
        if (authorizationVersion(operator, deps.cfg()) !== version) throw new PlatformContentError('Vault scan authorization has changed', 403);
        requirePlatformCapability(operator, 'operate');
        const endpoint = new URL(process.env.BITNET_URL || 'http://127.0.0.1:8080');
        if (!['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname) || !['http:', 'https:'].includes(endpoint.protocol)) throw new PlatformContentError('Vault analysis requires BitNet on this device', 403);
        if (deps.providerForModel('bitnet/auto') !== 'bitnet') throw new PlatformContentError('Local BitNet is unavailable', 503);
        const release = deps.acquire(); if (!release) throw new PlatformContentError('Execution capacity unavailable', 429);
        try { return await this.execute({ model: 'bitnet/auto', mode: 'chat', messages: [{ role: 'user', content: prompt }], max_tokens: 384, temperature: 0.2, response_format: { type: 'json_object', schema: VAULT_SUGGESTION_SCHEMA }, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) }, { operator }); }
        finally { release(); }
      },
    });
    this.insights = new PlatformInsightsService(this.store, {
      sessions: (ownerId, version) => {
        const operator = operatorForOwner(ownerId, deps.cfg());
        if (authorizationVersion(operator, deps.cfg()) !== version) throw new PlatformContentError('Insight authorization has changed', 403);
        requirePlatformCapability(operator, 'view');
        return this.visibleSessions(operator).filter(session => session.userId === ownerId);
      },
      analyze: async (ownerId, version, analysis, signal) => {
        const operator = operatorForOwner(ownerId, deps.cfg());
        if (authorizationVersion(operator, deps.cfg()) !== version) throw new PlatformContentError('Insight authorization has changed', 403);
        requirePlatformCapability(operator, 'operate');
        const endpoint = new URL(process.env.BITNET_URL || 'http://127.0.0.1:8080');
        if (!['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname) || !['http:', 'https:'].includes(endpoint.protocol)) throw new PlatformContentError('Insights require BitNet on this device', 403);
        if (deps.providerForModel('bitnet/auto') !== 'bitnet') throw new PlatformContentError('Local BitNet is unavailable', 503);
        const release = deps.acquire(); if (!release) throw new PlatformContentError('Execution capacity unavailable', 429);
        try { return await this.execute({ model: 'bitnet/auto', mode: 'chat', messages: [{ role: 'user', content: analysis.prompt }], max_tokens: 512, temperature: 0.1, response_format: { type: 'json_object', schema: analysis.schema }, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) }, { operator }); }
        finally { release(); }
      },
    });
    this.runs = new PlatformRunService(this.store, {
      concurrency: 4, acquire: () => deps.acquire(), begin: run => deps.begin(run), finish: run => deps.finish(run), spend: id => deps.spend(id),
      execute: (request, { run }) => {
        const operator = operatorForOwner(run.input.ownerId, deps.cfg());
        if (run.input.authorizationVersion !== authorizationVersion(operator, deps.cfg())) throw new PlatformContentError('The credential that authorized this queued run has changed. Create a new run after reviewing its state.', 403);
        requirePlatformCapability(operator, 'operate', globalWorkspace(run.workspaceId));
        return this.execute(request, { operator, profile: run.input.profileId ? this.requireProfile(run.input.profileId) : undefined, runId: run.id, workspaceId: run.workspaceId, repository: run.input.repository });
      },
      rollback: async run => {
        if (run.input.workingDirectory) {
          const gitService = new GitWorkspaceService(run.input.workingDirectory);
          await gitService.action({ action: 'rollback' });
        }
      },
      onUpdate: run => deps.event({ type: 'platform_run', id: run.id, status: run.status, revision: run.revision }),
    });
  }
  start(): Promise<void> {
    return this.started ??= (async () => { await this.content.initialize(); await this.runs.start(); await this.vault.settings('local-admin', authorizationVersion(operatorForOwner('local-admin', this.deps.cfg()), this.deps.cfg())); this.vault.start(); })().catch(error => { this.initError = error; });
  }
  async stop(): Promise<void> {
    for (const controller of this.sessionControllers.values()) controller.abort(new Error('Bridge is stopping'));
    await this.content.stop(); await this.vault.stop(); await this.insights.stop(); await this.runs.stop(); await this.store.close();
  }
  private visibleSessions(operator: PlatformOperatorContext): PlatformSession[] {
    return this.content.listSessions().filter(s => (operator.role === 'admin' || s.userId === operator.operatorId) && platformCapabilityAllowed(operator, 'view', globalWorkspace(s.workspaceId)));
  }
  private authorizeSession(operator: PlatformOperatorContext, id: string, capability: PlatformCapability): PlatformSession {
    const session = this.content.getSession(id);
    if (!session) throw new PlatformContentError('Session not found', 404);
    requirePlatformCapability(operator, capability, globalWorkspace(session.workspaceId));
    if (operator.role !== 'admin' && session.userId !== operator.operatorId) throw new PlatformContentError('Session belongs to another operator', 403);
    return session;
  }
  private authorizeMemory(operator: PlatformOperatorContext, memory: Pick<PlatformMemory, 'scope' | 'scopeId'>, capability: PlatformCapability): void {
    requirePlatformCapability(operator, capability, memory.scope === 'workspace' ? memory.scopeId : undefined);
    if (operator.role === 'admin') return;
    if (memory.scope === 'user' && memory.scopeId === operator.operatorId) return;
    if (memory.scope === 'workspace') return;
    throw new PlatformContentError('Provider, profile and agent memory is managed by administrators', 403);
  }
  private authorizeRun(operator: PlatformOperatorContext, run: PlatformRun | undefined, capability: PlatformCapability): PlatformRun {
    if (!run) throw new PlatformContentError('Run not found', 404);
    requirePlatformCapability(operator, capability, globalWorkspace(run.workspaceId));
    if (operator.role !== 'admin' && operator.role !== 'reviewer' && run.input.ownerId !== operator.operatorId) throw new PlatformContentError('Run belongs to another operator', 403);
    return run;
  }
  private requireProfile(id: string): PlatformProviderProfile { const p = this.profiles.get(id); if (!p) throw new PlatformContentError('Profile not found', 404); return p; }
  private async execute(request: ChatRequest, context: PlatformExecutionContext): Promise<string> {
    const release = context.profile ? this.profiles.acquire(context.profile.id) : undefined;
    let failure: unknown;
    try { return await this.deps.execute(request, context); } catch (error) { failure = error; throw error; } finally { release?.(failure); }
  }
  private instructions(body: Record<string, any>, provider: ProviderName, mode: 'chat' | 'plan' | 'agent'): { instructions: string; skillRefs: { id: string; version: number }[] } {
    const policy = this.deps.cfg().agentPolicies?.[provider];
    const denied = new Set((normalizeDisallowedTools(policy?.disallowedTools) || '').split(',').filter(Boolean));
    const available = provider.startsWith('cli-') ? KNOWN_TOOLS.filter(t => !denied.has(t.name) && (mode === 'agent' || !['Edit', 'Write', 'Bash', 'Shell', 'Terminal'].includes(t.name))).map(t => t.name) : [];
    const parts: string[] = []; const refs: { id: string; version: number }[] = [];
    if (body.agentId) {
      const resolved = this.catalog.resolveAgent(body.agentId, { provider, mode, availableTools: available });
      parts.push(resolved.instructions); refs.push(...resolved.agent.skillRefs);
    }
    if (body.skillRefs !== undefined && (!Array.isArray(body.skillRefs) || body.skillRefs.length > 20)) throw new PlatformContentError('Attach at most 20 skills');
    for (const ref of body.skillRefs || []) {
      if (!ref || typeof ref.id !== 'string' || !Number.isInteger(ref.version)) throw new PlatformContentError('Skills must use pinned ID/version references');
      const skill = this.catalog.getSkill(ref.id, ref.version);
      if (!skill || !skill.modes.includes(mode) || skill.requiredTools.some(tool => !available.includes(tool))) throw new PlatformContentError('Skill is unavailable or incompatible with this execution mode');
      if (refs.some(r => r.id === ref.id && r.version !== ref.version)) throw new PlatformContentError('Conflicting skill versions');
      if (!refs.some(r => r.id === ref.id)) { parts.push(skill.body); refs.push({ id: ref.id, version: ref.version }); }
    }
    return { instructions: parts.join('\n\n'), skillRefs: refs };
  }
  private contextInput(body: Record<string, any>, session: PlatformSession, operator: PlatformOperatorContext): ContextInput {
    const requestedAgentId = Object.hasOwn(body, 'agentId') ? (typeof body.agentId === 'string' && body.agentId ? body.agentId : undefined) : session.agentId;
    const agent = requestedAgentId ? this.catalog.getAgent(requestedAgentId) : undefined;
    const requestedProfileId = Object.hasOwn(body, 'profileId') ? (typeof body.profileId === 'string' && body.profileId ? body.profileId : undefined) : (session.profileId || agent?.profileId);
    const profile = requestedProfileId ? this.requireProfile(requestedProfileId) : undefined;
    const model = body.model || profile?.model || agent?.model || session.model;
    const provider = typeof model === 'string' ? this.deps.providerForModel(model) : undefined;
    if (!provider) throw new PlatformContentError('Select a known provider/model');
    if (profile && profile.provider !== provider) throw new PlatformContentError('The profile does not match the selected provider');
    const selected = this.deps.models().find(m => m.id === model);
    const workspace = globalWorkspace(session.workspaceId) ? this.deps.resolveWorkspace(session.workspaceId) : {};
    requirePlatformCapability(operator, 'operate', globalWorkspace(session.workspaceId));
    const attached = this.instructions({ ...body, agentId: body.agentId || session.agentId }, provider, 'chat');
    for (const id of body.memoryIds || []) {
      const memory = this.content.getMemory(id); if (!memory) throw new PlatformContentError('Memory not found', 404);
      this.authorizeMemory(operator, memory, 'view');
    }
    return {
      input: body.content ?? body.input, provider, model, profileId: profile?.id, agentId: requestedAgentId,
      contextTokens: Math.min(body.contextTokens ?? 8192, selected?.contextWindow ?? 8192, selected?.maxPromptChars ? Math.floor(selected.maxPromptChars / 4) : Infinity),
      maxOutputTokens: Math.min(body.maxOutputTokens ?? 1024, selected?.maxOutputTokens ?? 8192),
      systemPrompt: attached.instructions, memoryIds: body.memoryIds,
      effort: body.effort || agent?.defaultEffort || profile?.defaultEffort || 'low', fastMode: parseFastMode(body.fastMode) ?? agent?.defaultFastMode ?? profile?.defaultFastMode, mode: 'chat', cwd: workspace.cwd,
      expectedRevision: body.expectedRevision ?? body.revision, requestId: body.requestId,
    };
  }
  async handle(req: IncomingMessage, res: ServerResponse, readBody: () => Promise<string>): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/v1/platform/')) return false;
    const operator = authenticatePlatformOperator(req.headers.authorization, this.deps.cfg(), { isLoopback: ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') });
    if (!operator) { response(res, 401, { error: { message: 'A valid platform bearer token is required', type: 'unauthorized' } }); return true; }
    const method = req.method || 'GET';
    let segments: string[];
    try { segments = url.pathname.slice('/v1/platform/'.length).split('/').map(decodeURIComponent); } catch { response(res, 400, { error: { message: 'Invalid path encoding' } }); return true; }
    const [resource, id, action] = segments;
    try {
      requirePlatformCapability(operator, 'view');
      if (resource === 'me' && method === 'GET') { response(res, 200, { operator }); return true; }
      await this.start();
      const body = ['POST', 'PUT', 'PATCH'].includes(method) ? record(JSON.parse(await readBody() || '{}')) : {};
      if (resource === 'storage') {
        requirePlatformCapability(operator, 'admin');
        if (method === 'GET' && !id) response(res, 200, { storage: { backend: this.store.backend.kind, revision: this.store.revision, encrypted: this.store.backend.kind !== 'memory', ready: !this.initError, error: this.initError ? redactSecrets(this.initError.message) : undefined, availableBackends: [{ id: 'file', available: true }, { id: 'sqlite', available: true }, { id: 'prisma', available: false, reason: 'Provide a generated client through PrismaSnapshotBackend in the embedding application' }], credentials: secureStorageStatus(), migration: 'Use encrypted backup/restore with the selected backend after restarting. No silent database switch.' } });
        else if (method === 'GET' && id === 'backup') response(res, 200, await this.store.backup(this.codec));
        else if (method === 'POST' && id === 'restore') {
          if (this.runs.list().some(r => ['running', 'queued', 'waiting_approval'].includes(r.status)) || this.sessionControllers.size || this.vault.busy || this.insights.busy) throw new PlatformContentError('Stop active work before restoring a backup', 409);
          await this.store.restore(body as { format: string; data: string }, this.codec); response(res, 200, { restored: true });
        } else if (method === 'POST' && id === 'config') {
          if (!['file', 'sqlite'].includes(body.backend)) throw new PlatformContentError('Choose file or sqlite; Prisma clients are supplied by the embedding application');
          const config = { backend: body.backend as 'file' | 'sqlite' };
          (this.deps.saveConfig ?? saveConfig)({ platformStorage: config });
          this.deps.cfg().platformStorage = config;
          response(res, 200, { configured: config.backend, active: this.store.backend.kind, restartRequired: true, migration: 'Export an encrypted backup before restarting, then restore it into the selected adapter.' });
        } else throw new PlatformContentError('Unknown storage operation', 404);
        return true;
      }
      if (this.initError) throw new PlatformContentError(`Platform storage is unavailable: ${this.initError.message}`, 503, 'storage_unavailable');
      if (resource === 'diagnostics' && method === 'GET') {
        requirePlatformCapability(operator, 'admin'); response(res, 200, { data: await this.deps.diagnostics(), storage: { backend: this.store.backend.kind }, credentials: secureStorageStatus() }); return true;
      }
      if (resource === 'models' && method === 'GET') { response(res, 200, { data: this.deps.models().map(model => ({ ...model, capabilities: model.capabilities ?? capabilitiesFor(model.provider, model.id) })) }); return true; }
      if (resource === 'workspaces' && method === 'GET') {
        response(res, 200, { data: this.deps.workspaces().filter(w => platformCapabilityAllowed(operator, 'view', w.id)) }); return true;
      }
      if (resource === 'presets') {
        const model = method === 'GET' ? url.searchParams.get('model') : body.model;
        if (!model || !this.deps.providerForModel(model)) throw new PlatformContentError('Select a model to bind the preset roles');
        const roles = { planner: body.planner || model, implementer: body.implementer || model, reviewer: body.reviewer || model, security: body.security || model };
        if (Object.values(roles).some(m => typeof m !== 'string' || !this.deps.providerForModel(m))) throw new PlatformContentError('Every role must use a known provider/model');
        const efforts = Object.fromEntries(Object.keys(roles).map(role => [role, body.roleEfforts?.[role] || body.effort || undefined]));
        const fastModes = Object.fromEntries(Object.keys(roles).map(role => [role, parseFastMode(body.roleFastModes?.[role]) ?? parseFastMode(body.fastMode)]));
        const definitions = buildCodingPipelines(roles, efforts, fastModes);
        if (method === 'GET' && !id) response(res, 200, { data: definitions });
        else if (method === 'POST' && id && action === 'install') {
          requirePlatformCapability(operator, 'admin');
          const definition = definitions.find(p => p.id === id); if (!definition) throw new PlatformContentError('Preset not found', 404);
          response(res, 201, { pipeline: this.deps.installPipeline?.(definition) });
        } else throw new PlatformContentError('Unknown preset operation', 404);
        return true;
      }
      if (resource === 'operators') {
        requirePlatformCapability(operator, 'admin');
        if (method === 'GET') response(res, 200, { data: (this.deps.cfg().platformAuth?.operators || []).map(({ tokenHash: _hash, ...entry }) => entry) });
        else if (method === 'POST') {
          if (typeof body.id !== 'string' || !/^[\w-]{1,80}$/.test(body.id) || !['viewer', 'operator', 'reviewer', 'admin'].includes(body.role)) throw new PlatformContentError('A safe operator ID and valid role are required');
          const workspaces = body.workspaceIds ?? [];
          if (!Array.isArray(workspaces) || workspaces.some((v: unknown) => typeof v !== 'string' || (v !== '*' && !this.deps.workspaces().some(w => w.id === v)))) throw new PlatformContentError('Select registered workspace IDs');
          const credential = createPlatformOperatorCredential();
          const operators = this.deps.cfg().platformAuth?.operators ?? [];
          const config = { operators: [...operators.filter(o => o.id !== body.id), { id: body.id, displayName: body.displayName, role: body.role, workspaceIds: workspaces, enabled: true, tokenHash: credential.tokenHash }] };
          (this.deps.saveConfig ?? saveConfig)({ platformAuth: config }); this.deps.cfg().platformAuth = config;
          response(res, 201, { operator: { id: body.id, role: body.role, workspaceIds: workspaces }, token: credential.token });
        } else if (method === 'DELETE' && id) {
          const config = { operators: (this.deps.cfg().platformAuth?.operators || []).filter(o => o.id !== id) };
          (this.deps.saveConfig ?? saveConfig)({ platformAuth: config }); this.deps.cfg().platformAuth = config; response(res, 200, { deleted: true });
        } else throw new PlatformContentError('Unknown operator operation', 404);
        return true;
      }
      if (resource === 'insights') {
        const version = authorizationVersion(operator, this.deps.cfg());
        if (!id && method === 'GET') response(res, 200, this.insights.view(operator.operatorId, version));
        else if (id === 'refresh' && method === 'POST') {
          requirePlatformCapability(operator, 'operate');
          if (!['de', 'en'].includes(body.language)) throw new PlatformContentError('Select English or German');
          if (this.insights.busy) throw new PlatformContentError('Local insight analysis is already running', 409);
          void this.insights.scan(operator.operatorId, version, body.language).catch(() => {});
          response(res, 202, { started: true });
        } else if (id === 'cancel' && method === 'POST') {
          requirePlatformCapability(operator, 'operate'); this.insights.cancel(operator.operatorId); response(res, 200, { cancelled: true });
        } else throw new PlatformContentError('Unknown insight operation', 404);
        return true;
      }
      if (resource === 'vault') {
        const version = authorizationVersion(operator, this.deps.cfg());
        if (id === 'search' && method === 'GET') {
          const controller = new AbortController(); const abort = () => controller.abort(); res.once('close', abort);
          try { response(res, 200, await this.vault.search(this.visibleSessions(operator), url.searchParams.get('query') || '', url.searchParams.get('mode') || 'text', Number(url.searchParams.get('limit') || 50), controller.signal)); }
          finally { res.off('close', abort); }
        } else if ((!id || id === 'settings') && method === 'GET') {
          const sessions = this.visibleSessions(operator);
          const settings = await this.vault.settings(operator.operatorId, version);
          const { authorizationVersion: _version, ...publicSettings } = settings;
          response(res, 200, { settings: publicSettings, sessions: sessions.length, messages: sessions.reduce((n, s) => n + s.messages.length, 0), suggestions: this.vault.suggestions(operator.operatorId, sessions) });
        } else if (id === 'settings' && method === 'PATCH') {
          requirePlatformCapability(operator, 'operate');
          const { authorizationVersion: _version, ...settings } = await this.vault.configure(operator.operatorId, version, { enabled: body.enabled, intervalMinutes: body.intervalMinutes });
          response(res, 200, { settings });
        } else if (id === 'scan' && method === 'POST') {
          requirePlatformCapability(operator, 'operate');
          if (this.vault.busy) throw new PlatformContentError('A vault scan is already running', 409);
          void this.vault.scan(operator.operatorId, version).catch(() => {});
          response(res, 202, { started: true });
        } else if (id === 'suggestions' && action && method === 'DELETE') {
          requirePlatformCapability(operator, 'operate'); await this.vault.dismiss(operator.operatorId, action); response(res, 200, { dismissed: true });
        } else throw new PlatformContentError('Unknown vault operation', 404);
        return true;
      }
      if (resource === 'projects') {
        requirePlatformCapability(operator, method === 'GET' ? 'view' : 'operate');
        if (!id && method === 'GET') response(res, 200, { data: this.content.listProjects().filter(project => operator.role === 'admin' || project.userId === operator.operatorId) });
        else if (!id && method === 'POST') response(res, 201, { project: await this.content.createProject({ name: body.name, userId: operator.operatorId }) });
        else {
          const project = this.content.getProject(id);
          if (!project || (operator.role !== 'admin' && project.userId !== operator.operatorId)) throw new PlatformContentError('Project not found', 404);
          if (!action && method === 'PATCH') response(res, 200, { project: await this.content.updateProject(id, { name: body.name, expectedRevision: body.expectedRevision }) });
          else if (!action && method === 'DELETE') { await this.content.deleteProject(id); response(res, 200, { deleted: true }); }
          else throw new PlatformContentError('Unknown project operation', 404);
        }
        return true;
      }
      if (resource === 'sessions') {
        if (!id && method === 'GET') {
          const data = this.content.listSessions().filter(s => (operator.role === 'admin' || s.userId === operator.operatorId) && platformCapabilityAllowed(operator, 'view', globalWorkspace(s.workspaceId))).map(({ messages, ...s }) => ({ ...s, messageCount: messages.length }));
          response(res, 200, { data }); return true;
        }
        if (!id && method === 'POST') {
          const workspace = body.workspaceId && body.workspaceId !== 'default' ? this.deps.resolveWorkspace(body.workspaceId) : {};
          requirePlatformCapability(operator, 'operate', workspace.workspaceId);
          const session = await this.content.createSession({ title: body.title, retention: body.retention, workspaceId: workspace.workspaceId, userId: operator.operatorId, projectId: body.projectId, agentId: body.agentId, model: body.model, profileId: body.profileId, ttlMs: body.ttlMs });
          await this.vault.settings(operator.operatorId, authorizationVersion(operator, this.deps.cfg()));
          response(res, 201, { session }); return true;
        }
        const session = this.authorizeSession(operator, id, method === 'GET' ? 'view' : 'operate');
        if (!action && method === 'GET') response(res, 200, { session });
        else if (!action && method === 'PATCH') response(res, 200, { session: await this.content.updateSession(id, { projectId: body.projectId, title: body.title, retention: body.retention, model: body.model, provider: body.model ? this.deps.providerForModel(body.model) : undefined, profileId: body.profileId, agentId: body.agentId, ttlMs: body.ttlMs, expectedRevision: body.expectedRevision ?? body.revision }) });
        else if (!action && method === 'DELETE') { await this.content.deleteSession(id); response(res, 200, { deleted: true }); }
        else if (action === 'export' && method === 'GET') response(res, 200, JSON.parse(this.content.exportSession(id, 'json')));
        else if (action === 'branch' && method === 'POST') {
          const branched = await this.content.branchSession(id, { ...(body.content !== undefined ? { beforeMessageId: body.messageId } : { throughMessageId: body.messageId }), title: body.title, retention: session.retention });
          response(res, 201, { session: branched });
        } else if (action === 'summary' && method === 'POST') response(res, 200, { session: await this.content.setSummary(id, { throughMessageId: body.throughMessageId, content: body.content, expectedRevision: body.expectedRevision ?? body.revision }) });
        else if (action === 'cancel' && method === 'POST') { this.sessionControllers.get(id)?.abort(new Error('Cancelled by operator')); this.content.cancelTurn(id); response(res, 200, { cancelled: true }); }
        else if (action === 'context' && method === 'POST') response(res, 200, { context: this.content.prepareContext(id, this.contextInput(body, session, operator)) });
        else if (action === 'messages' && method === 'POST') {
          const release = this.deps.acquire(); if (!release) throw new PlatformContentError('Execution concurrency or rate limit reached', 429);
          const controller = new AbortController(); const abort = () => controller.abort(new Error('Client disconnected'));
          res.once('close', abort);
          try {
            if (this.sessionControllers.has(id)) throw new PlatformContentError('Conversation already has an active request', 409);
            this.sessionControllers.set(id, controller);
            const input = { ...this.contextInput(body, session, operator), signal: controller.signal };
            const stream = body.stream === true;
            const send = (event: unknown) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
            if (stream) res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
            let resolvedModel = input.model;
            let resolvedProvider = input.provider;
            const result = await this.content.runTurn(id, input, async (request, _context, captureDelta) => {
              if (stream) send({ type: 'saved', requestId: request.requestId });
              const content = await this.execute(request, {
                operator,
                sessionId: id,
                workspaceId: session.workspaceId,
                profile: input.profileId ? this.requireProfile(input.profileId) : undefined,
                fallbackModels: (session as any).fallbackModels ?? this.deps.cfg().orchestrator?.fallbackModels,
                onFallbackModelUsed: fb => {
                  resolvedModel = fb;
                  resolvedProvider = this.deps.providerForModel(fb) || input.provider;
                },
                onDelta: delta => { captureDelta(delta); if (stream) send({ type: 'delta', delta }); },
                onExecutionEvent: event => { if (stream) send({ type: 'execution_event', event }); },
              });
              return { content, model: resolvedModel, provider: resolvedProvider };
            });
            if (stream) { send({ type: 'done', ...result }); res.end(); } else response(res, 200, result);
          } finally { res.off('close', abort); if (this.sessionControllers.get(id) === controller) this.sessionControllers.delete(id); release(); }
        } else throw new PlatformContentError('Unknown session operation', 404);
        return true;
      }
      if (resource === 'memories') {
        if (method === 'GET' && !id) {
          const data = this.content.listMemories({ query: url.searchParams.get('query') || undefined }).filter(m => { try { this.authorizeMemory(operator, m, 'view'); return true; } catch { return false; } });
          response(res, 200, { data }); return true;
        }
        if (method === 'POST' && !id) {
          const scope = body.scope || 'user'; const scopeId = scope === 'user' ? operator.operatorId : body.scopeId;
          this.authorizeMemory(operator, { scope, scopeId }, 'operate');
          if (scope === 'workspace') this.deps.resolveWorkspace(scopeId);
          const input = { title: body.title || 'Memory', content: body.content, scope, scopeId, ttlMs: body.ttlMs, provenance: { sourceType: body.provenance?.sourceType || 'manual', sourceRef: body.provenance?.sourceRef } };
          if (body.status === 'approved') this.authorizeMemory(operator, { scope, scopeId }, 'review');
          let memory = await this.content.proposeMemory(input);
          if (body.status === 'approved') memory = await this.content.approveMemory(memory.id, memory.revision, operator.operatorId);
          response(res, 201, { memory }); return true;
        }
        const memory = this.content.getMemory(id); if (!memory) throw new PlatformContentError('Memory not found', 404);
        this.authorizeMemory(operator, memory, method === 'GET' ? 'view' : body.status ? 'review' : 'operate');
        if (method === 'GET') response(res, 200, { memory });
        else if (method === 'PATCH' && body.status) {
          if (!['approved', 'rejected'].includes(body.status)) throw new PlatformContentError('Memory decision must be approved or rejected');
          response(res, 200, { memory: await this.content.reviewMemory(id, body.status === 'approved' ? 'approve' : 'reject', body.expectedRevision ?? body.revision, operator.operatorId) });
        } else if (method === 'PATCH') response(res, 200, { memory: await this.content.updateMemory(id, { title: body.title, content: body.content, ttlMs: body.ttlMs, expectedRevision: body.expectedRevision ?? body.revision }) });
        else if (method === 'DELETE') response(res, 200, { deleted: await this.content.deleteMemory(id) });
        else throw new PlatformContentError('Unknown memory operation', 404);
        return true;
      }
      if (['skills', 'prompts', 'agents'].includes(resource)) {
        const kind = resource as 'skills' | 'prompts' | 'agents';
        if (method === 'GET') {
          const version = url.searchParams.has('version') ? Number(url.searchParams.get('version')) : undefined;
          const value = kind === 'skills' ? (id ? this.catalog.getSkill(id, version) : this.catalog.listSkills()) : kind === 'prompts' ? (id ? this.catalog.getPrompt(id, version) : this.catalog.listPrompts()) : (id ? this.catalog.getAgent(id) : this.catalog.listAgents());
          if (!value) throw new PlatformContentError('Catalog item not found', 404);
          response(res, 200, id ? { [kind.slice(0, -1)]: value } : { data: value });
        } else {
          requirePlatformCapability(operator, 'admin');
          if (method === 'POST' || method === 'PATCH') {
            const input = { ...body, id: id || body.id, expectedRevision: body.expectedRevision ?? body.revision, expectedVersion: body.expectedVersion ?? body.version };
            const value = kind === 'skills' ? await this.catalog.saveSkill(input as any) : kind === 'prompts' ? await this.catalog.savePrompt(input as any) : await this.catalog.saveAgent(input as any);
            response(res, method === 'POST' ? 201 : 200, { [kind.slice(0, -1)]: value });
          } else if (method === 'DELETE' && id) {
            const deleted = kind === 'skills' ? await this.catalog.deleteSkill(id) : kind === 'prompts' ? await this.catalog.deletePrompt(id) : await this.catalog.deleteAgent(id);
            response(res, 200, { deleted });
          } else throw new PlatformContentError('Unknown catalog operation', 404);
        }
        return true;
      }
      if (resource === 'profiles') {
        requirePlatformCapability(operator, 'admin');
        const safe = (p: PlatformProviderProfile) => ({ ...p, credentialRef: undefined, hasCredential: Boolean(p.credentialRef), credentialSource: p.credentialRef ? 'encrypted-vault' : 'provider default', ...this.profiles.status(p.id) });
        if (method === 'GET') { if (id) response(res, 200, { profile: safe(this.requireProfile(id)) }); else response(res, 200, { data: this.profiles.list().map(safe) }); }
        else if (method === 'POST' || method === 'PATCH') {
          const existing = id || body.id ? this.requireProfile(id || body.id) : undefined;
          if (body.cliExecutable && (!isAbsolute(body.cliExecutable) || !existsSync(body.cliExecutable) || !statSync(body.cliExecutable).isFile())) throw new PlatformContentError('CLI executable must be an existing absolute file path');
          if (body.credentialRef !== undefined) throw new PlatformContentError('Credential references cannot be supplied directly; use the write-only key field');
          const options = { keyEnvironmentVariable: this.deps.cfg().securityStorage?.vaultKeyEnvironmentVariable, keyId: this.deps.cfg().securityStorage?.vaultKeyId };
          let credentialRef = body.clearCredential ? undefined : existing?.credentialRef;
          if (body.apiKey) {
            if (typeof body.apiKey !== 'string' || !['claude-api', 'codex-api', 'gemini-api', 'openrouter-api', 'perplexity-api'].includes(body.provider || existing?.provider)) throw new PlatformContentError('API credentials require an API provider profile');
            credentialRef = openSecretVault(options).put(body.apiKey);
          }
          const profile = await this.profiles.save({ ...existing, ...body, id: existing?.id, name: body.name ?? existing?.name, provider: body.provider ?? existing?.provider, expectedRevision: body.expectedRevision ?? body.revision, credentialRef });
          if (existing?.credentialRef && existing.credentialRef !== credentialRef) openSecretVault(options).delete(existing.credentialRef);
          response(res, 201, { profile: safe(profile) });
        } else if (method === 'DELETE' && id) {
          const existing = this.requireProfile(id); await this.profiles.delete(id);
          if (existing.credentialRef) openSecretVault({ keyEnvironmentVariable: this.deps.cfg().securityStorage?.vaultKeyEnvironmentVariable, keyId: this.deps.cfg().securityStorage?.vaultKeyId }).delete(existing.credentialRef);
          response(res, 200, { deleted: true });
        } else throw new PlatformContentError('Unknown profile operation', 404);
        return true;
      }
      if (resource === 'runs') {
        if (method === 'GET' && !id) { response(res, 200, { data: this.runs.list().filter(r => { try { this.authorizeRun(operator, r, 'view'); return true; } catch { return false; } }).map(publicRun) }); return true; }
        if (method === 'POST' && !id) {
          const input = this.prepareRun(body, operator); const run = await this.runs.create(input); response(res, 202, { run: publicRun(run) }); return true;
        }
        const isRunAction = action === 'actions' || ['approve', 'reject', 'cancel', 'retry', 'continue', 'rollback'].includes(action);
        const runAction = action === 'actions' ? body.action : action;
        const capability = isRunAction && ['approve', 'reject'].includes(runAction) ? 'review' : method === 'GET' ? 'view' : 'operate';
        const run = this.authorizeRun(operator, this.runs.get(id), capability);
        if (method === 'GET' && action === 'events') response(res, 200, { data: run.steps.flatMap(s => s.events || []) });
        else if (method === 'GET' && !action) response(res, 200, { run: publicRun(run) });
        else if (method === 'POST' && isRunAction) response(res, 200, { run: publicRun(await this.runs.action(id, runAction, operator.operatorId, body.feedback)) });
        else if (method === 'DELETE' && !action) { await this.runs.delete(id); response(res, 200, { deleted: true }); }
        else throw new PlatformContentError('Unknown run operation', 404);
        return true;
      }
      if (resource === 'artifacts' && id && method === 'GET') {
        const artifact = this.runs.getArtifact(id); if (!artifact) throw new PlatformContentError('Artifact not found', 404);
        this.authorizeRun(operator, this.runs.get(artifact.runId), 'view');
        if (url.searchParams.get('download') === '1') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${artifact.name}"`, 'Cache-Control': 'no-store' }); res.end(artifact.content); }
        else response(res, 200, { artifact }); return true;
      }
      if (resource === 'evaluations') {
        requirePlatformCapability(operator, 'operate');
        if (method === 'POST') {
          if (!Array.isArray(body.models) || !body.models.length || body.models.length > 8 || body.models.some((m: unknown) => typeof m !== 'string' || !this.deps.providerForModel(m))) throw new PlatformContentError('Select 1 to 8 known models');
          const group = `evaluation-${randomUUID()}`; const runIds: string[] = [];
          for (const model of [...new Set<string>(body.models)]) {
            const run = await this.runs.create({ prompt: 'This is a tiny instruction-following evaluation. Reply with exactly EVAL_OK. Do not use tools.', model, effort: body.effort, fastMode: parseFastMode(body.fastMode), mode: 'chat', maxIterations: 1, maxOutputTokens: 64, successPattern: 'EVAL_OK', ownerId: operator.operatorId, authorizationVersion: authorizationVersion(operator, this.deps.cfg()), idempotencyKey: `${group}:${runIds.length}` }); runIds.push(run.id);
          }
          const evaluation = { id: group, ownerId: operator.operatorId, createdAt: Date.now(), runIds, fixture: 'instruction-following-v1' };
          await this.store.transaction(tx => tx.put('platform.evaluations', group, evaluation)); response(res, 202, { evaluation });
        } else if (method === 'GET') {
          const data = this.store.list<{ id: string; ownerId: string; runIds: string[] }>('platform.evaluations').filter(e => e.ownerId === operator.operatorId || operator.role === 'admin').map(e => ({ ...e, runs: e.runIds.map(runId => { const run = this.runs.get(runId); return { id: runId, status: run?.status, model: run?.model, costUsd: run?.costUsd, passed: run?.status === 'completed' && run.steps.at(-1)?.content?.trim() === 'EVAL_OK' }; }) })); response(res, 200, { data });
        } else throw new PlatformContentError('Unknown evaluation operation', 404);
        return true;
      }
      throw new PlatformContentError('Platform endpoint not found', 404, 'not_found');
    } catch (error) {
      const e = error as Error & { status?: number; code?: string };
      const message = redactSecrets(e.message || 'Platform operation failed');
      if (res.headersSent) { if (!res.destroyed) { res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`); res.end(); } }
      else response(res, e.status ?? (e.code === 'SECURE_STORAGE_UNAVAILABLE' ? 503 : error instanceof SyntaxError ? 400 : 400), { error: { message, type: e.code || 'platform_error' } });
      return true;
    }
  }
  private prepareRun(body: Record<string, any>, operator: PlatformOperatorContext): PlatformRunInput {
    const agent = body.agentId ? this.catalog.getAgent(body.agentId) : undefined;
    const profile = body.profileId || agent?.profileId ? this.requireProfile(body.profileId || agent?.profileId) : undefined;
    const model = body.model || agent?.model || profile?.model;
    const provider = typeof model === 'string' ? this.deps.providerForModel(model) : undefined;
    if (!provider) throw new PlatformContentError('Select a known provider/model');
    if (profile && profile.provider !== provider) throw new PlatformContentError('Profile does not match selected model');
    const mode = body.mode || agent?.mode || 'chat';
    const workspace = body.workspaceId || body.workingDirectory || body.repository || mode === 'agent' ? this.deps.resolveWorkspace(body.workspaceId, body.workingDirectory, body.repository) : {};
    requirePlatformCapability(operator, 'operate', workspace.workspaceId);
    const instructions = this.instructions(body, provider, mode);
    if (mode === 'agent' && this.deps.cfg().agentPolicies?.[provider]?.agentEnabled === false) throw new PlatformContentError('Agent mode is disabled for this provider', 403);
    const allowUnconfined = body.allowUnconfined === true
      || this.deps.cfg().agentPolicies?.[provider]?.allowUnconfined === true
      || this.deps.cfg().allowUnconfined === true;
    const confinementErr = agentConfinementError(provider, mode, { allowUnconfined });
    if (confinementErr) throw new PlatformContentError(confinementErr, 403);
    return {
      prompt: body.prompt, model, profileId: profile?.id, agentId: agent?.id, workspaceId: workspace.workspaceId,
      repository: workspace.repository, workingDirectory: workspace.cwd, mode, effort: body.effort || agent?.defaultEffort || profile?.defaultEffort, fastMode: parseFastMode(body.fastMode) ?? agent?.defaultFastMode ?? profile?.defaultFastMode, maxIterations: body.maxIterations,
      maxDurationMs: body.maxDurationMs, maxTokens: body.maxTokens, maxOutputTokens: body.maxOutputTokens,
      maxCostUsd: workspace.maxCostUsd !== undefined ? Math.min(body.maxCostUsd ?? 0.5, workspace.maxCostUsd) : body.maxCostUsd,
      requiresApproval: workspace.requiresApproval || body.requiresApproval === true,
      rollbackOnFailure: body.rollbackOnFailure === true,
      successPattern: body.successPattern,
      idempotencyKey: body.idempotencyKey, instructions: instructions.instructions, skillRefs: instructions.skillRefs, ownerId: operator.operatorId, authorizationVersion: authorizationVersion(operator, this.deps.cfg()),
    };
  }
}
