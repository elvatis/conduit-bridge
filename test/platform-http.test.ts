import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { BridgeConfig, ChatRequest } from '../src/types.js';

const state = vi.hoisted(() => ({
  runtime: '', calls: [] as ChatRequest[],
  respond: async (_request: ChatRequest): Promise<string> => 'A useful short result.',
}));
vi.mock('../src/config.js', async original => ({
  ...await original<typeof import('../src/config.js')>(),
  runtimeDir: () => {
    if (!state.runtime) throw new Error('Test runtime was not initialized');
    return state.runtime;
  },
}));
vi.mock('../src/registry.js', () => {
  const providers = ['cli-claude', 'cli-codex', 'bitnet'].map(name => ({
    name, models: [{ id: name === 'bitnet' ? 'bitnet/auto' : name === 'cli-claude' ? 'cli-claude/claude-opus-5' : 'cli-codex/gpt-5.6-sol', provider: name, displayName: name, owned_by: 'test' }],
    ensureConnected: async () => true,
    checkSession: async () => true,
    chat: async (request: ChatRequest) => { state.calls.push(request); return state.respond(request); },
    async *chatStream(request: ChatRequest) {
      state.calls.push(request);
      const result = await state.respond(request);
      yield result.slice(0, 5); yield result.slice(5);
    },
  }));
  return { ProviderRegistry: class {
    providerForModel(id: string) { return providers.find(p => p.models.some(m => m.id === id)); }
    lookup(name: string) { return providers.find(p => p.name === name); }
    get(name: string) { return this.lookup(name); }
    allModels() { return providers.flatMap(p => p.models); }
    refreshApiModels = async () => ({});
  } };
});

import { GitWorkspaceService } from '../src/git-workspace.js';
import { RepositoryAnalyticsService } from '../src/repository-analytics.js';
import { BridgeServer } from '../src/server.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';
import { hashPlatformToken } from '../src/platform-auth.js';

const modelA = 'cli-claude/claude-opus-5';
const modelB = 'cli-codex/gpt-5.6-sol';
const tokens = { admin: 'admin-platform-http-fixture-token-32', alice: 'alice-platform-http-fixture-token-32', bob: 'bob-platform-http-fixture-token-32', viewer: 'viewer-platform-http-fixture-token-32', reviewer: 'reviewer-platform-http-fixture-token-32' };
type Actor = keyof typeof tokens;
let server: BridgeServer;
let base: string;
let store: TransactionalStateStore;
let config: BridgeConfig;

beforeEach(async () => {
  state.runtime = mkdtempSync(join(tmpdir(), 'conduit-platform-http-'));
  state.calls = [];
  vi.stubEnv('BITNET_URL', 'http://127.0.0.1:8080');
  state.respond = async () => 'A useful short result.';
  store = new TransactionalStateStore(new MemorySnapshotBackend());
  await store.ready();
  config = {
    host: '127.0.0.1', port: 0, logLevel: 'silent', apiKeys: {}, authToken: tokens.admin,
    rateLimit: { perMinute: 200, maxConcurrent: 2 },
    platformAuth: { operators: (['alice', 'bob', 'viewer', 'reviewer'] as const).map(id => ({
      id, role: id === 'viewer' || id === 'reviewer' ? id : 'operator', workspaceIds: ['*'], tokenHash: hashPlatformToken(tokens[id]), enabled: true,
    })) },
  };
  server = new BridgeServer(config, { platformStore: store });
  await server.start();
  base = `http://127.0.0.1:${((server as any)._server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await server?.stop();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (state.runtime.startsWith(join(tmpdir(), 'conduit-platform-http-'))) rmSync(state.runtime, { recursive: true, force: true });
});

async function api(path: string, body?: unknown, actor: Actor = 'admin', method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, {
    method, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000),
  });
  return { status: response.status, data: await response.json() };
}
async function session(actor: Actor = 'admin', body: Record<string, unknown> = {}) {
  const result = await api('/v1/platform/sessions', { model: modelA, ...body }, actor);
  expect(result.status).toBe(201);
  return result.data.session;
}
async function turn(id: string, content: string, extra: Record<string, unknown> = {}, actor: Actor = 'admin') {
  return api(`/v1/platform/sessions/${id}/messages`, { content, maxOutputTokens: 64, ...extra }, actor);
}
async function untilRun(id: string, status: string) {
  let run: any;
  await vi.waitFor(async () => {
    const result = await api(`/v1/platform/runs/${id}`);
    expect(result.status).toBe(200); run = result.data.run; expect(run.status).toBe(status);
  }, { timeout: 3000, interval: 15 });
  return run;
}
function deferred() {
  let resolve!: (output: string) => void;
  const promise = new Promise<string>(done => { resolve = done; });
  return { promise, resolve };
}

describe('platform HTTP conversations', () => {
  it('persists the default transcript and switches providers with canonical history', async () => {
    const created = await session();
    expect(created.retention).toBe('retained');
    state.respond = async () => 'Orion noted.';
    expect((await turn(created.id, 'The design is Orion')).status).toBe(200);
    state.respond = async () => 'Orion';
    const second = await turn(created.id, 'Name?', { model: modelB });
    expect(second.status).toBe(200);
    expect(state.calls[1].messages.map(m => m.content)).toEqual(['The design is Orion', 'Orion noted.', 'Name?']);
    expect(second.data.session.messages.map((m: any) => m.provider)).toEqual(['cli-claude', 'cli-claude', 'cli-codex', 'cli-codex']);
    expect(second.data.session.model).toBe(modelB);
    expect(store.list('platform.sessions')).toHaveLength(1);
    const context = await api(`/v1/platform/sessions/${created.id}/context`, { content: 'Continue', maxOutputTokens: 64 });
    expect(context.status).toBe(200);
    expect(context.data.context.selectedMessageIds).toHaveLength(4);
    expect(context.data.context.messages.at(-1).content).toBe('Continue');
    expect(state.calls).toHaveLength(2);
  });

  it('streams deltas and one completed canonical turn over SSE', async () => {
    const created = await session();
    state.respond = async () => 'Hello streaming';
    const response = await fetch(`${base}/v1/platform/sessions/${created.id}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Greet', stream: true, maxOutputTokens: 64 }), signal: AbortSignal.timeout(4000),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = (await response.text()).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
    expect(events.filter(e => e.type === 'delta').map(e => e.delta).join('')).toBe('Hello streaming');
    expect(events.filter(e => e.type === 'done')).toHaveLength(1);
    expect(events.at(-1).session.messages.map((m: any) => m.content)).toEqual(['Greet', 'Hello streaming']);
    expect(state.calls).toHaveLength(1);
  });

  it('persists retention changes with revision conflicts and branches edits before the selected message', async () => {
    const created = await session();
    const first = await turn(created.id, 'Original');
    const second = await turn(created.id, 'Second');
    const current = second.data.session;
    const retained = await api(`/v1/platform/sessions/${created.id}`, { retention: 'retained', revision: current.revision }, 'admin', 'PATCH');
    expect(retained.status).toBe(200);
    expect(store.read<any>('platform.sessions', created.id)?.messages).toHaveLength(4);
    expect((await api(`/v1/platform/sessions/${created.id}`, { title: 'Stale', revision: current.revision }, 'admin', 'PATCH')).status).toBe(409);
    const branch = await api(`/v1/platform/sessions/${created.id}/branch`, { messageId: second.data.userMessage.id, content: 'Edited second' });
    expect(branch.status).toBe(201);
    expect(branch.data.session.messages.map((m: any) => m.id)).toEqual(first.data.session.messages.map((m: any) => m.id));
    const edited = await turn(branch.data.session.id, 'Edited second');
    expect(edited.status).toBe(200);
    expect(edited.data.session.messages[2].content).toBe('Edited second');
    expect((await api(`/v1/platform/sessions/${created.id}`)).data.session.messages[2].content).toBe('Second');
    const summary = await api(`/v1/platform/sessions/${created.id}/summary`, { content: 'Original was answered.', throughMessageId: first.data.assistantMessage.id, revision: retained.data.session.revision });
    expect(summary.status).toBe(200);
    const context = await api(`/v1/platform/sessions/${created.id}/context`, { content: 'Next', maxOutputTokens: 64 });
    expect(context.data.context.summaryUsed).toBe(true);
    const ephemeral = await api(`/v1/platform/sessions/${created.id}`, { retention: 'ephemeral', revision: summary.data.session.revision }, 'admin', 'PATCH');
    expect(ephemeral.status).toBe(200);
    expect(store.read('platform.sessions', created.id)).toMatchObject({ retention: 'retained' });
  });

  it('does not let a rejected concurrent request remove the first cancellation controller', async () => {
    const created = await session();
    const gate = deferred(); state.respond = () => gate.promise;
    const first = turn(created.id, 'First');
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    expect((await turn(created.id, 'Concurrent')).status).toBe(409);
    expect((await api(`/v1/platform/sessions/${created.id}/cancel`, {})).status).toBe(200);
    const cancelled = await first;
    expect(cancelled.status).toBe(400);
    expect(state.calls[0].signal?.aborted).toBe(true);
    expect((await api(`/v1/platform/sessions/${created.id}`)).data.session.messages).toEqual([expect.objectContaining({ content: 'First', status: 'interrupted' })]);
    gate.resolve('Late output');
    state.respond = async () => 'Retry result';
    expect((await turn(created.id, 'Retry')).status).toBe(200);
    expect(state.calls).toHaveLength(2);
  });

  it('rejects a profile/model mismatch and uses the saved profile defaults on context and send', async () => {
    const saved = await api('/v1/platform/profiles', { name: 'Second provider', provider: 'cli-codex', model: modelB, defaultEffort: 'low' });
    expect(saved.status).toBe(201);
    const created = await session('admin', { profileId: saved.data.profile.id });
    const mismatch = await turn(created.id, 'Mismatch', { model: modelA });
    expect(mismatch.status).toBe(400); expect(state.calls).toHaveLength(0);
    const sent = await turn(created.id, 'Use saved profile');
    expect(sent.status).toBe(200); expect(state.calls[0].model).toBe(modelB);
    expect(sent.data.session.profileId).toBe(saved.data.profile.id);
  });
});

describe('platform HTTP authorization and memory', () => {
  it('allows scoped model discovery while denying legacy settings and cross-operator sessions', async () => {
    expect((await api('/v1/platform/models', undefined, 'viewer')).status).toBe(200);
    expect((await api('/v1/models', undefined, 'viewer')).status).toBe(401);
    expect((await api('/v1/settings', undefined, 'alice')).status).toBe(401);
    expect((await api('/v1/platform/sessions', { model: modelA }, 'viewer')).status).toBe(403);
    const owned = await session('alice');
    expect(owned.userId).toBe('alice');
    expect((await api(`/v1/platform/sessions/${owned.id}`, undefined, 'bob')).status).toBe(403);
    expect((await turn(owned.id, 'Other user', {}, 'bob')).status).toBe(403);
    expect((await api('/v1/platform/sessions', undefined, 'bob')).data.data).toEqual([]);
    expect((await api(`/v1/platform/sessions/${owned.id}`, undefined, 'admin')).status).toBe(200);
  });

  it('keeps candidates out of context, enforces review rights, and records authenticated reviewer identity', async () => {
    const owned = await session('alice');
    const proposed = await api('/v1/platform/memories', { title: 'Design', content: 'Call the design Orion', scope: 'user', scopeId: 'bob' }, 'alice');
    expect(proposed.status).toBe(201);
    const memory = proposed.data.memory;
    expect(memory).toMatchObject({ status: 'candidate', scopeId: 'alice' });
    const context = () => api(`/v1/platform/sessions/${owned.id}/context`, { content: 'Name?', maxOutputTokens: 64, memoryIds: [memory.id] }, 'alice');
    expect((await context()).status).toBe(403);
    expect((await api(`/v1/platform/memories/${memory.id}`, { status: 'approved', reviewedBy: 'forged' }, 'alice', 'PATCH')).status).toBe(403);
    const approved = await api(`/v1/platform/memories/${memory.id}`, { status: 'approved', reviewedBy: 'forged', revision: memory.revision }, 'admin', 'PATCH');
    expect(approved.status).toBe(200);
    expect(approved.data.memory.reviewedBy).toBe('local-admin');
    expect((await context()).data.context.selectedMemoryIds).toEqual([memory.id]);
    const edited = await api(`/v1/platform/memories/${memory.id}`, { content: 'New unreviewed value', revision: approved.data.memory.revision }, 'alice', 'PATCH');
    expect(edited.status).toBe(200); expect(edited.data.memory.status).toBe('candidate');
    expect(edited.data.memory.reviewedBy).toBeUndefined();
    expect((await context()).status).toBe(403);
    expect((await api(`/v1/platform/memories/${memory.id}`, undefined, 'bob')).status).toBe(403);
    const bobs = await session('bob');
    expect((await api(`/v1/platform/sessions/${bobs.id}/context`, { content: 'Name?', memoryIds: [memory.id] }, 'bob')).status).toBe(403);
  });

  it('rejects approval bypass at creation and administration-only memory scopes', async () => {
    expect((await api('/v1/platform/memories', { content: 'Approved without review', status: 'approved' }, 'alice')).status).toBe(403);
    for (const scope of ['provider', 'profile', 'agent']) {
      expect((await api('/v1/platform/memories', { content: 'Unauthorized', scope, scopeId: 'target' }, 'alice')).status).toBe(403);
    }
    expect((await api('/v1/platform/memories', undefined, 'alice')).data.data).toEqual([]);
  });
});

describe('platform HTTP effort settings', () => {
  it('persists agent/profile defaults and applies explicit chat and run overrides', async () => {
    const profile = await api('/v1/platform/profiles',{name:'Effort profile',provider:'cli-claude',model:modelA,defaultEffort:'ultracode'});
    expect(profile.status).toBe(201);
    const agent = await api('/v1/platform/agents',{name:'Reviewer',model:modelA,profileId:profile.data.profile.id,defaultEffort:'high',defaultFastMode:true});
    expect(agent.status).toBe(201);
    expect(agent.data.agent.defaultEffort).toBe('high');
    const chat = await session('admin',{agentId:agent.data.agent.id});
    expect((await turn(chat.id,'Inherited')).status).toBe(200);
    expect(state.calls.at(-1)?.effort).toBe('high'); expect(state.calls.at(-1)?.fastMode).toBe(true);
    expect((await turn(chat.id,'Explicit',{effort:'medium',fastMode:false})).status).toBe(200);
    expect(state.calls.at(-1)?.effort).toBe('medium'); expect(state.calls.at(-1)?.fastMode).toBe(false);
    const run = await api('/v1/platform/runs',{prompt:'One iteration',agentId:agent.data.agent.id,maxIterations:1,maxOutputTokens:64});
    expect(run.status).toBe(202); await untilRun(run.data.run.id,'completed');
    expect(state.calls.at(-1)?.effort).toBe('high');
    expect((await api('/v1/platform/agents',{name:'Invalid effort',defaultEffort:'bogus'})).status).toBe(400);
  });

  it('binds preset role effort and forwards the shared evaluation level to every model', async () => {
    const installed = await api('/v1/platform/presets/platform-feature-review/install',{model:modelB,effort:'high',fastMode:true,security:modelA,roleEfforts:{security:'medium'},roleFastModes:{security:false}});
    expect(installed.status).toBe(201);
    expect(installed.data.pipeline.steps.find((step: any) => step.id === 'security')).toMatchObject({model:modelA,effort:'medium',fastMode:false});
    expect(installed.data.pipeline.steps.find((step: any) => step.id === 'implement')).toMatchObject({model:modelB,effort:'high',fastMode:true});
    state.respond = async () => 'EVAL_OK';
    const evaluation = await api('/v1/platform/evaluations',{models:[modelA,modelB],effort:'low',fastMode:true});
    expect(evaluation.status).toBe(202);
    for (const id of evaluation.data.evaluation.runIds) await untilRun(id,'completed');
    expect(state.calls.map(request => request.effort)).toEqual(['low','low']);
    expect(state.calls.map(request => request.fastMode)).toEqual([true,true]);
  });

  it('uses role and fallback effort for orchestration while preserving a request override', async () => {
    const configured = await api('/v1/orchestrator',{enabled:true,strategy:'sequential',roles:[{name:'Reviewer',model:modelA,effort:'high',fastMode:true}],fallbackModels:[modelB],fallbackEffort:'low',fallbackFastMode:false});
    expect(configured.status).toBe(200);
    state.respond = async request => { if (request.model === modelA) throw new Error('Fixture unavailable'); return 'Reviewed'; };
    expect((await api('/v1/orchestrator/run',{prompt:'Review fixture'})).status).toBe(200);
    expect(state.calls.map(request => request.effort)).toEqual(['high','low']);
    expect(state.calls.map(request => request.fastMode)).toEqual([true,false]);
    state.calls = [];
    expect((await api('/v1/orchestrator/run',{prompt:'Review with override',effort:'medium'})).status).toBe(200);
    expect(state.calls.map(request => request.effort)).toEqual(['medium','medium']);
  });
});

describe('platform HTTP durable runs', () => {
  it('forwards effort and exposes command evidence only through authorized run reads', async () => {
    const gate = deferred();
    state.respond = request => {
      request.onExecutionEvent!({kind:'command',id:'command-1',command:'npm test',startedAt:1,status:'running',combinedOutput:'Testing'});
      return gate.promise;
    };
    const created = await api('/v1/platform/runs',{prompt:'Verify',model:modelB,effort:'high',maxOutputTokens:64},'alice');
    expect(created.status).toBe(202);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    expect(state.calls[0].effort).toBe('high');
    const own = await api(`/v1/platform/runs/${created.data.run.id}`,undefined,'alice');
    expect(own.data.run.steps[0].events[0]).toMatchObject({command:'npm test',combinedOutput:'Testing'});
    expect((await api(`/v1/platform/runs/${created.data.run.id}`,undefined,'bob')).status).toBe(403);
    gate.resolve('Verified'); await untilRun(created.data.run.id,'completed');
  });
  it('returns 202, performs exactly two bounded iterations, and exposes evidence with accounting', async () => {
    state.respond = async () => state.calls.length === 1 ? 'One repair needed.' : 'DONE with evidence';
    const created = await api('/v1/platform/runs', { prompt: 'Fix a synthetic issue', model: modelA, maxIterations: 2, maxOutputTokens: 64, successPattern: 'DONE' });
    expect(created.status).toBe(202);
    const run = await untilRun(created.data.run.id, 'completed');
    expect(state.calls).toHaveLength(2); expect(run.steps).toHaveLength(2); expect(run.artifacts).toHaveLength(2);
    expect(run.steps.map((step: any) => ({ status: step.status, content: step.content }))).toEqual([
      { status: 'completed', content: 'One repair needed.' }, { status: 'completed', content: 'DONE with evidence' },
    ]);
    const artifact = await api(`/v1/platform/artifacts/${run.artifacts[1].id}`);
    expect(artifact.status).toBe(200); expect(artifact.data.artifact.content).toBe('DONE with evidence');
    expect(run.tokensConsumed).toBeGreaterThan(0);
    const metrics = (await api('/v1/metrics')).data.models[modelA];
    expect(metrics).toMatchObject({ requests: 2, successes: 2, failures: 0, inFlight: 0 });
  });

  it('holds the shared concurrency lease after returning 202 until the active run finishes', async () => {
    config.rateLimit!.maxConcurrent = 1;
    const gate = deferred(); state.respond = () => gate.promise;
    const first = await api('/v1/platform/runs', { prompt: 'First', model: modelA, maxOutputTokens: 64 });
    expect(first.status).toBe(202);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    const second = await api('/v1/platform/runs', { prompt: 'Second', model: modelA, maxOutputTokens: 64 });
    expect(second.status).toBe(202);
    expect((await api(`/v1/platform/runs/${second.data.run.id}`)).data.run.status).toBe('queued');
    expect(state.calls).toHaveLength(1);
    state.respond = async () => 'Second result'; gate.resolve('First result');
    await untilRun(first.data.run.id, 'completed');
    await untilRun(second.data.run.id, 'completed');
    expect(state.calls).toHaveLength(2);
  });

  it('requires reviewer approval and preserves its authenticated identity', async () => {
    const created = await api('/v1/platform/runs', { prompt: 'Draft', model: modelA, maxOutputTokens: 64, requiresApproval: true }, 'alice');
    expect(created.status).toBe(202);
    await untilRun(created.data.run.id, 'waiting_approval'); expect(state.calls).toHaveLength(0);
    expect((await api(`/v1/platform/runs/${created.data.run.id}/actions`, { action: 'approve' }, 'alice')).status).toBe(403);
    const approved = await api(`/v1/platform/runs/${created.data.run.id}/actions`, { action: 'approve', operator: 'forged', feedback: 'Proceed' }, 'reviewer');
    expect(approved.status).toBe(200);
    const run = await untilRun(created.data.run.id, 'completed');
    expect(run.approval.operator).toBe('reviewer'); expect(state.calls).toHaveLength(1);
    expect((await api(`/v1/platform/runs/${run.id}/actions`, { action: 'approve' }, 'reviewer')).status).toBe(409);
  });
});


describe('platform HTTP vault', () => {
  it('searches the authorized full transcript and denies volatile storage', async () => {
    const alice = await session('alice'); const bob = await session('bob');
    await turn(alice.id, 'SharedNeedle PRIVATE_ALICE', {}, 'alice');
    await turn(bob.id, 'SharedNeedle PRIVATE_BOB', {}, 'bob');
    const result = await api('/v1/platform/vault/search?query=SharedNeedle', undefined, 'alice');
    expect(result.status).toBe(200); expect(result.data.total).toBe(1);
    expect(result.data.data[0]).toMatchObject({ sessionId: alice.id });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BOB');
    expect((await api('/v1/platform/vault/search?query=SharedNeedle')).data.total).toBe(2);
    expect((await api('/v1/platform/vault/settings', { intervalMinutes: 5 }, 'viewer', 'PATCH')).status).toBe(403);
    expect((await api('/v1/platform/vault/scan', {}, 'viewer')).status).toBe(403);
    expect((await api('/v1/platform/storage/config', { backend: 'memory' })).status).toBe(400);
  });

  it('routes private analysis only to local BitNet and persists suggestions with owned sources', async () => {
    const alice = await session('alice'); const bob = await session('bob');
    await turn(alice.id, 'Please add explicit tests', {}, 'alice');
    await turn(bob.id, 'PRIVATE_BOB', {}, 'bob');
    state.calls = [];
    state.respond = async () => JSON.stringify({ suggestions: [{ title: 'Testing requirements', reason: 'The request needs acceptance criteria.', prompt: 'State the acceptance criteria before implementation.', sources: [0, 1] }] });
    expect((await api('/v1/platform/vault/scan', {}, 'alice')).status).toBe(202);
    await vi.waitFor(async () => expect((await api('/v1/platform/vault', undefined, 'alice')).data.settings.status).toBe('complete'));
    expect(state.calls).toHaveLength(1); expect(state.calls[0].model).toBe('bitnet/auto');
    expect(JSON.stringify(state.calls)).not.toContain('PRIVATE_BOB');
    const status = (await api('/v1/platform/vault', undefined, 'alice')).data;
    expect(status.settings.authorizationVersion).toBeUndefined();
    expect(status.suggestions).toHaveLength(1); expect(status.suggestions[0].sources[0].sessionId).toBe(alice.id);
    expect((await api('/v1/platform/vault/suggestions/' + status.suggestions[0].id, {}, 'bob', 'DELETE')).status).toBe(404);
    vi.stubEnv('BITNET_URL', 'https://remote.example.test');
    expect((await api('/v1/platform/vault/scan', {}, 'alice')).status).toBe(202);
    await vi.waitFor(async () => expect((await api('/v1/platform/vault', undefined, 'alice')).data.settings.status).toBe('error'));
    expect(state.calls).toHaveLength(1);
  });
});

describe('repository workspace HTTP authorization', () => {
  function register(path = state.runtime) {
    const result = server.workspaceManager.addOrUpdateWorkspace(path, 'Repository fixture', true);
    if (!result.entry) throw new Error(result.error);
    server.governanceManager.saveRepository({id:'fixture-repository',name:'Fixture',path});
    return result.entry.id;
  }
  it('allows scoped reads and rejects unknown or ungranted workspaces before reading Git', async () => {
    const workspaceId = register();
    const snapshot = vi.spyOn(GitWorkspaceService.prototype, 'snapshot').mockResolvedValue({detected:false,branches:[],worktrees:[],commits:[],files:[],truncated:false,historyLimit:180,updatedAt:new Date().toISOString()});
    expect((await api('/api/git-workspace/snapshot?workspaceId=' + workspaceId, undefined, 'viewer')).status).toBe(200);
    expect(snapshot).toHaveBeenCalledTimes(1);
    config.platformAuth!.operators!.find(operator => operator.id === 'viewer')!.workspaceIds = ['ungranted-workspace'];
    expect((await api('/api/git-workspace/snapshot?workspaceId=' + workspaceId, undefined, 'viewer')).status).toBe(403);
    expect((await api('/api/git-workspace/snapshot?workspaceId=unknown&path=C:/', undefined, 'admin')).status).toBe(404);
    const unauthenticated = await fetch(base + '/api/git-workspace/snapshot?workspaceId=' + workspaceId);
    expect(unauthenticated.status).toBe(401);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
  it('binds analytics to canonical registered roots and filters catalogs by workspace access', async () => {
    const repository = join(state.runtime, 'repository');
    const alias = join(state.runtime, 'repository alias');
    mkdirSync(repository);
    symlinkSync(repository, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const workspaceId = register(alias);
    const read = vi.spyOn(RepositoryAnalyticsService.prototype, 'read').mockResolvedValue({status:'empty',snapshots:[]} as any);
    const catalog = await api('/v1/analytics/repositories', undefined, 'viewer');
    expect(catalog.status).toBe(200);
    expect(catalog.data.data).toContainEqual({id:'fixture-repository',name:'Fixture'});
    expect((await api('/v1/analytics/repository?repository=fixture-repository&branch=HEAD', undefined, 'viewer')).status).toBe(200);
    expect(read.mock.calls[0][0].path).toBe(realpathSync.native(repository));
    config.platformAuth!.operators!.find(operator => operator.id === 'viewer')!.workspaceIds = [workspaceId + '-other'];
    expect((await api('/v1/analytics/repositories', undefined, 'viewer')).data.data).toEqual([]);
    expect((await api('/v1/analytics/repository?repository=fixture-repository', undefined, 'viewer')).status).toBe(403);
    expect((await api('/v1/analytics/repository?repository=unknown&path=C:/', undefined, 'admin')).status).toBe(404);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('requires workspace admin and repository policy for explicit Git mutations', async () => {
    const workspaceId = register();
    const action = vi.spyOn(GitWorkspaceService.prototype, 'action').mockResolvedValue({ok:true,message:'Fixture action accepted'});
    const body = {workspaceId,action:'fetch'};
    expect((await api('/api/git-workspace/action', body, 'viewer')).status).toBe(403);
    expect((await api('/api/git-workspace/action', body, 'alice')).status).toBe(403);
    const crossSite = await fetch(base + '/api/git-workspace/action', {method:'POST',headers:{Authorization:'Bearer ' + tokens.admin,'Content-Type':'application/json',Origin:'https://outside.example'},body:JSON.stringify(body)});
    expect(crossSite.status).toBe(403);
    expect(action).not.toHaveBeenCalled();
    expect((await api('/api/git-workspace/action', body, 'admin')).status).toBe(200);
    expect(action).toHaveBeenCalledExactlyOnceWith({action:'fetch',worktree:undefined,name:undefined});
    server.governanceManager.saveRepository({id:'fixture-repository',name:'Fixture',path:state.runtime,overrides:{requireApproval:true}});
    expect((await api('/api/git-workspace/action', body, 'admin')).status).toBe(403);
    expect(action).toHaveBeenCalledTimes(1);
  });
  it('validates modes and opaque worktree identifiers before the Git service', async () => {
    const workspaceId = register();
    const diff = vi.spyOn(GitWorkspaceService.prototype, 'diff');
    expect((await api('/api/git-workspace/diff?workspaceId=' + workspaceId + '&mode=execute', undefined, 'admin')).status).toBe(400);
    expect((await api('/api/git-workspace/diff?workspaceId=' + workspaceId + '&worktree=../../other', undefined, 'admin')).status).toBe(400);
    expect(diff).not.toHaveBeenCalled();
    expect((await api('/api/git-workspace/action', [], 'admin')).status).toBe(400);
  });
});
describe('chat project HTTP authorization', () => {
  it('scopes project names and mutations to the owner, and retains assigned chats through moves', async () => {
    const created = await api('/v1/platform/projects', { name: 'Alice launch' }, 'alice');
    expect(created.status).toBe(201);
    const project = created.data.project;
    expect((await api('/v1/platform/projects', undefined, 'alice')).data.data).toEqual([project]);
    expect((await api('/v1/platform/projects', undefined, 'bob')).data.data).toEqual([]);
    expect((await api('/v1/platform/projects/' + project.id, { name: 'Hijacked' }, 'bob', 'PATCH')).status).toBe(404);
    expect((await api('/v1/platform/projects', { name: 'Viewer project' }, 'viewer')).status).toBe(403);
    expect((await api('/v1/platform/sessions', { model: modelA, projectId: project.id }, 'bob')).status).toBe(404);
    const chat = await session('alice', { title: 'Launch checklist', projectId: project.id });
    expect(chat.projectId).toBe(project.id);
    await turn(chat.id, 'Preserve this conversation', {}, 'alice');
    expect((await api('/v1/platform/projects/' + project.id, {}, 'alice', 'DELETE')).status).toBe(409);
    const moved = await api('/v1/platform/sessions/' + chat.id, { projectId: null, expectedRevision: 3 }, 'alice', 'PATCH');
    expect(moved.status).toBe(200); expect(moved.data.session.projectId).toBeUndefined();
    expect(moved.data.session.messages).toHaveLength(2); expect(moved.data.session.workspaceId).toBe(chat.workspaceId);
    expect((await api('/v1/platform/projects/' + project.id, {}, 'alice', 'DELETE')).status).toBe(200);
    expect((await api('/v1/platform/sessions/' + chat.id, undefined, 'alice')).data.session.messages).toHaveLength(2);
  });
});
