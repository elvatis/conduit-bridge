import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const providers = ['cli-claude', 'cli-codex'].map(name => ({
    name, models: [{ id: `${name}/http-test`, provider: name, displayName: name, owned_by: 'test' }],
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

import { BridgeServer } from '../src/server.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';
import { hashPlatformToken } from '../src/platform-auth.js';

const modelA = 'cli-claude/http-test';
const modelB = 'cli-codex/http-test';
const tokens = { admin: 'admin-platform-http-fixture-token-32', alice: 'alice-platform-http-fixture-token-32', bob: 'bob-platform-http-fixture-token-32', viewer: 'viewer-platform-http-fixture-token-32', reviewer: 'reviewer-platform-http-fixture-token-32' };
type Actor = keyof typeof tokens;
let server: BridgeServer;
let base: string;
let store: TransactionalStateStore;
let config: BridgeConfig;

beforeEach(async () => {
  state.runtime = mkdtempSync(join(tmpdir(), 'conduit-platform-http-'));
  state.calls = [];
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
  it('keeps the default transcript ephemeral and switches providers with canonical history', async () => {
    const created = await session();
    expect(created.retention).toBe('ephemeral');
    state.respond = async () => 'Orion noted.';
    expect((await turn(created.id, 'The design is Orion')).status).toBe(200);
    state.respond = async () => 'Orion';
    const second = await turn(created.id, 'Name?', { model: modelB });
    expect(second.status).toBe(200);
    expect(state.calls[1].messages.map(m => m.content)).toEqual(['The design is Orion', 'Orion noted.', 'Name?']);
    expect(second.data.session.messages.map((m: any) => m.provider)).toEqual(['cli-claude', 'cli-claude', 'cli-codex', 'cli-codex']);
    expect(second.data.session.model).toBe(modelB);
    expect(store.list('platform.sessions')).toEqual([]);
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
    expect(store.read('platform.sessions', created.id)).toBeUndefined();
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
    expect((await api(`/v1/platform/sessions/${created.id}`)).data.session.messages).toEqual([]);
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

describe('platform HTTP durable runs', () => {
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
