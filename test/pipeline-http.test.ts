import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ChatRequest } from '../src/types.js';
import type { PipelineRun, PipelineStep } from '../src/pipelines.js';

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
  const model = { id: 'cli-grok/http-test', provider: 'cli-grok', displayName: 'HTTP fixture', owned_by: 'test' };
  const provider = {
    name: 'cli-grok', models: [model],
    ensureConnected: async () => true,
    chat: async (request: ChatRequest) => {
      state.calls.push(request);
      return state.respond(request);
    },
  };
  return { ProviderRegistry: class {
    providerForModel(id: string) { return id === model.id ? provider : undefined; }
    lookup(name: string) { return name === provider.name ? provider : undefined; }
    get() { return provider; }
    allModels() { return [model]; }
    refreshApiModels = async () => ({});
  } };
});

import { BridgeServer } from '../src/server.js';

let server: BridgeServer;
let base: string;

beforeEach(async () => {
  state.runtime = mkdtempSync(join(tmpdir(), 'conduit-pipeline-http-'));
  state.calls = [];
  state.respond = async () => 'A useful short result.';
  server = new BridgeServer({ host: '127.0.0.1', port: 0, logLevel: 'silent', apiKeys: {}, rateLimit: { perMinute: 100, maxConcurrent: 1 } });
  await server.start();
  const address = (server as any)._server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await server?.stop();
  if (state.runtime.startsWith(join(tmpdir(), 'conduit-pipeline-http-'))) rmSync(state.runtime, { recursive: true, force: true });
});

async function api(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(3000),
  });
  return { status: response.status, data: await response.json() };
}

const step = (id: string, extra: Partial<PipelineStep> = {}): PipelineStep => ({
  id, name: id, model: 'cli-grok/http-test', mode: 'chat',
  promptTemplate: `${id}: {{prompt}}\n{{prior_steps}}`, max_tokens: 64, ...extra,
});

async function start(steps: PipelineStep[]) {
  const saved = await api('/v1/pipelines', { name: 'Community HTTP example', steps });
  expect(saved.status).toBe(200);
  const accepted = await api('/v1/pipelines/run', { pipelineId: saved.data.pipeline.id, prompt: 'Explain the benefit in one sentence.' });
  expect(accepted.status).toBe(202);
  expect(accepted.data.status).toBe('accepted');
  expect(accepted.data.run.id).toBeTruthy();
  expect(accepted.data.run.initialPrompt).toBe('Explain the benefit in one sentence.');
  return accepted.data.run.id as string;
}

async function detail(id: string): Promise<PipelineRun> {
  const result = await api('/v1/pipelines/runs/' + encodeURIComponent(id));
  expect(result.status).toBe(200);
  return result.data.run;
}

async function until(id: string, status: PipelineRun['status']) {
  let run: PipelineRun | undefined;
  await vi.waitFor(async () => { run = await detail(id); expect(run.status).toBe(status); }, { timeout: 3000, interval: 15 });
  return run!;
}

function deferred() {
  let resolve!: (output: string) => void;
  const promise = new Promise<string>(done => { resolve = done; });
  return { promise, resolve };
}

describe('pipeline HTTP lifecycle', () => {
  it('returns a durable run immediately, exposes in-flight progress, then accounts completion exactly once', async () => {
    const gate = deferred();
    state.respond = () => gate.promise;
    const id = await start([step('explain')]);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    const pending = await detail(id);
    expect(pending.status).toBe('running');
    expect(pending.stepResults.explain.status).toBe('running');
    expect((await api('/v1/pipelines/runs')).data.data.some((run: PipelineRun) => run.id === id)).toBe(true);
    gate.resolve('A queue absorbs short bursts and smooths processing.');
    const complete = await until(id, 'completed');
    expect(complete.stepResults.explain.content).toContain('absorbs short bursts');
    const metrics = (await api('/v1/metrics')).data.models['cli-grok/http-test'];
    expect(metrics).toMatchObject({ requests: 1, successes: 1, failures: 0, inFlight: 0 });
    expect(metrics.outputTokens).toBeGreaterThan(0);
  });

  it('recovers an approval through a fresh GET and executes the approved step exactly once with content', async () => {
    const id = await start([step('draft'), step('review', { requiresApproval: true, dependsOn: ['draft'] })]);
    const paused = await until(id, 'waiting_approval');
    expect(paused.pendingApprovalStepId).toBe('review');
    expect(state.calls).toHaveLength(1);
    // A refreshed browser retrieves the pending run; execution context remains
    // private in the running service's memory.
    const restored = await detail(id);
    expect(restored.status).toBe('waiting_approval');
    expect(restored.pendingApprovalStepId).toBe('review');
    const approved = await api('/v1/pipelines/runs/action', { runId: id, action: 'approve', stepId: 'review', feedback: 'Keep one sentence.' });
    expect(approved.status).toBe(202);
    const completed = await until(id, 'completed');
    expect(completed.stepResults.review.content).toBe('A useful short result.');
    expect(state.calls).toHaveLength(2);
    const duplicate = await api('/v1/pipelines/runs/action', { runId: id, action: 'approve', stepId: 'review' });
    expect(duplicate.status).toBe(400);
    expect(state.calls).toHaveLength(2);
    expect((await api('/v1/metrics')).data.models['cli-grok/http-test'].requests).toBe(2);
  });

  it('loads a summary after service restart and marks the pending run interrupted', async () => {
    const id = await start([step('draft'), step('review', { requiresApproval: true, dependsOn: ['draft'] })]);
    await until(id, 'waiting_approval');
    expect(state.calls).toHaveLength(1);
    await server.stop();
    server = new BridgeServer({ host: '127.0.0.1', port: 0, logLevel: 'silent', apiKeys: {}, rateLimit: { perMinute: 100, maxConcurrent: 1 } });
    await server.start();
    base = `http://127.0.0.1:${((server as any)._server.address() as AddressInfo).port}`;
    const restored = await detail(id);
    expect(restored.status).toBe('interrupted');
    expect(restored.error).toContain('private execution context is not persisted');
    expect(restored.initialPrompt).toBe('');
    expect(restored.definition).toBeUndefined();
    expect(restored.pendingApprovalStepId).toBeUndefined();
    expect(restored.stepResults.draft.content).toBeUndefined();
    const approved = await api('/v1/pipelines/runs/action', { runId: id, action: 'approve', stepId: 'review' });
    expect(approved.status).toBe(400);
    expect(state.calls).toHaveLength(1);
  });

  it('waits for both debate perspectives before synthesis and records all three calls', async () => {
    const pro = deferred(), con = deferred();
    state.respond = request => {
      const prompt = String(request.messages[0].content);
      if (prompt.startsWith('pro:')) return pro.promise;
      if (prompt.startsWith('con:')) return con.promise;
      return Promise.resolve('Choose queues when burst tolerance outweighs operational overhead.');
    };
    const id = await start([
      step('pro', { parallelGroup: 'perspectives' }), step('con', { parallelGroup: 'perspectives' }),
      step('synthesis', { dependsOn: ['pro', 'con'] }),
    ]);
    await vi.waitFor(() => expect(state.calls).toHaveLength(2));
    pro.resolve('Queues absorb bursts.');
    await vi.waitFor(async () => expect((await detail(id)).stepResults.pro.status).toBe('completed'));
    expect(state.calls).toHaveLength(2);
    expect((await detail(id)).stepResults.synthesis.status).toBe('pending');
    con.resolve('Queues add operational overhead.');
    const result = await until(id, 'completed');
    expect(state.calls).toHaveLength(3);
    expect(state.calls[2].messages[0].content).toContain('Queues absorb bursts.');
    expect(state.calls[2].messages[0].content).toContain('Queues add operational overhead.');
    expect(result.stepResults.synthesis.content).toContain('burst tolerance');
    expect((await api('/v1/metrics')).data.models['cli-grok/http-test']).toMatchObject({ requests: 3, successes: 3, inFlight: 0 });
  });

  it('cancels an active run, stops downstream work, and retains the terminal status after provider resolution', async () => {
    const gate = deferred();
    state.respond = () => gate.promise;
    const id = await start([step('first'), step('downstream', { dependsOn: ['first'] })]);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    const cancelled = await api('/v1/pipelines/runs/action', { runId: id, action: 'cancel' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.run.status).toBe('cancelled');
    gate.resolve('Late output must not restart the pipeline.');
    await vi.waitFor(async () => expect((await api('/v1/metrics')).data.models['cli-grok/http-test'].inFlight).toBe(0));
    const terminal = await detail(id);
    expect(terminal.status).toBe('cancelled');
    expect(terminal.stepResults.downstream.status).not.toBe('completed');
    expect(state.calls).toHaveLength(1);
  });

  it('holds async pipeline capacity until execution finishes', async () => {
    const gate = deferred();
    state.respond = () => gate.promise;
    const firstId = await start([step('first')]);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));

    const saved = await api('/v1/pipelines', { name: 'Second pipeline', steps: [step('second')] });
    const blocked = await api('/v1/pipelines/run', {
      pipelineId: saved.data.pipeline.id,
      prompt: 'This must wait for execution capacity.',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.data.error.type).toBe('rate_limit_error');

    gate.resolve('First run completed.');
    await until(firstId, 'completed');
    await vi.waitFor(() => expect((server as any)._pipelineExecutions.size).toBe(0));
    const accepted = await api('/v1/pipelines/run', {
      pipelineId: saved.data.pipeline.id,
      prompt: 'Capacity is available now.',
    });
    expect(accepted.status).toBe(202);
  });
});
