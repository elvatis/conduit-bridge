import { describe, it, expect, afterEach } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { TransactionalStateStore, MemorySnapshotBackend } from '../src/storage.js';
import { PlatformRunService, type PlatformRunRuntime } from '../src/platform-runs.js';
import { PlatformProfileService } from '../src/platform-profiles.js';

const services: PlatformRunService[] = [];
async function setup(runtime: PlatformRunRuntime) {
  const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
  const service = new PlatformRunService(store, runtime); services.push(service); await service.start(); return { service, store };
}
async function terminal(service: PlatformRunService, id: string) {
  for (let i = 0; i < 150; i++) { const run = service.get(id)!; if (!['running', 'queued', 'waiting_approval'].includes(run.status)) return run; await delay(5); }
  throw new Error('Run did not finish');
}
afterEach(async () => { await Promise.all(services.splice(0).map(s => s.stop())); });

describe('bounded durable agent runs', () => {
  it('executes a bounded repair, retains evidence, and never adds a hidden final call', async () => {
    let calls = 0;
    const { service } = await setup({ execute: async () => ++calls === 1 ? 'Need one repair' : 'DONE with evidence' });
    const run = await service.create({ prompt: 'Fix a synthetic issue', model: 'lmstudio/test', maxIterations: 2, successPattern: 'DONE' });
    const completed = await terminal(service, run.id);
    expect(completed.status).toBe('completed'); expect(calls).toBe(2); expect(completed.steps).toHaveLength(2);
    expect(completed.steps.map(step => [step.status, step.content])).toEqual([['completed', 'Need one repair'], ['completed', 'DONE with evidence']]);
    expect(service.getArtifact(completed.artifacts[1].id)?.content).toBe('DONE with evidence');
  });
  it('detects no progress and idempotency conflicts before further dispatch', async () => {
    let calls = 0; const { service } = await setup({ execute: async () => { calls++; return 'Unchanged'; } });
    const input = { prompt: 'Repair', model: 'lmstudio/test', maxIterations: 5, successPattern: 'DONE', idempotencyKey: 'once' };
    const [a, b] = await Promise.all([service.create(input), service.create(input)]); expect(a.id).toBe(b.id);
    expect((await terminal(service, a.id)).stopReason).toContain('No progress'); expect(calls).toBe(2);
    await expect(service.create({ ...input, prompt: 'Different' })).rejects.toThrow('different run input');
  });
  it('enforces approvals before execution and binds the decision to the stored run', async () => {
    let calls = 0; const { service } = await setup({ execute: async () => { calls++; return 'done'; } });
    const run = await service.create({ prompt: 'Review', model: 'lmstudio/test', requiresApproval: true });
    await delay(20); expect(calls).toBe(0);
    await service.action(run.id, 'approve', 'reviewer-1');
    expect((await terminal(service, run.id)).approval?.operator).toBe('reviewer-1'); expect(calls).toBe(1);
    await expect(service.action(run.id, 'approve', 'reviewer-1')).rejects.toThrow('not awaiting');
  });
  it('cancels a hung provider and never automatically retries agent side effects', async () => {
    const { service } = await setup({ execute: async () => new Promise(() => {}) });
    const run = await service.create({ prompt: 'Write', model: 'lmstudio/test', mode: 'agent', maxDurationMs: 100 });
    const cancelled = await terminal(service, run.id); expect(cancelled.status).toBe('cancelled');
    expect(cancelled.error).toContain('deadline');
    await expect(service.action(run.id, 'retry', 'operator')).rejects.toThrow('side effects');
  });
  it('blocks oversize cost and token reservations without dispatch', async () => {
    let calls = 0; const { service } = await setup({ execute: async () => { calls++; return 'done'; } });
    const a = await service.create({ prompt: 'Cost', model: 'cli-codex/model', maxCostUsd: 0 });
    expect((await terminal(service, a.id)).error).toContain('cost');
    const b = await service.create({ prompt: 'Tokens', model: 'lmstudio/test', maxTokens: 1 });
    expect((await terminal(service, b.id)).error).toContain('token'); expect(calls).toBe(0);
  });
  it('retains a queue slot until execution completes and marks crash work interrupted', async () => {
    let release!: (value: string) => void; let calls = 0;
    const { service, store } = await setup({ concurrency: 1, execute: async () => { calls++; return new Promise<string>(resolve => { release = resolve; }); } });
    const a = await service.create({ prompt: 'First', model: 'lmstudio/test' });
    const b = await service.create({ prompt: 'Second', model: 'lmstudio/test' });
    for (let i = 0; i < 20 && !release; i++) await delay(5);
    expect(calls).toBe(1); expect(service.get(b.id)?.status).toBe('queued');
    await service.action(b.id, 'cancel', 'operator'); release('done'); await terminal(service, a.id);
    const interrupted = { ...service.get(a.id)!, id: 'run-crash', status: 'running' as const, ownerPid: process.pid, revision: 1 };
    await store.transaction(tx => tx.put('platform.runs', interrupted.id, interrupted));
    const recovered = new PlatformRunService(store, { execute: async () => { throw new Error('must not replay'); } }); services.push(recovered); await recovered.start();
    expect(recovered.get('run-crash')?.status).toBe('interrupted');
  });
});

it('isolates profile concurrency/cooldown and protects revision updates', async () => {
  const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
  const service = new PlatformProfileService(store);
  const p = await service.save({ name: 'Account A', provider: 'cli-codex', maxConcurrent: 1, cooldownMs: 100 });
  const release = service.acquire(p.id); expect(() => service.acquire(p.id)).toThrow('concurrency');
  release(new Error('provider failure')); expect(() => service.acquire(p.id)).toThrow('cooling down');
  await expect(service.save({ ...p, name: 'Lost update' })).rejects.toThrow('changed');
  await service.save({ ...p, expectedRevision: p.revision, name: 'Account A updated' });
});

it('keeps profile acquisition mutually exclusive with update and deletion', async () => {
  const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
  const service = new PlatformProfileService(store);
  const profile = await service.save({ name: 'Mutable account', provider: 'cli-codex' });

  const release = service.acquire(profile.id);
  await expect(service.save({ ...profile, expectedRevision: profile.revision, name: 'Unsafe update' })).rejects.toThrow('active requests');
  await expect(service.delete(profile.id)).rejects.toThrow('active requests');
  release();

  const transaction = store.transaction.bind(store);
  let entered!: () => void; const began = new Promise<void>(resolve => { entered = resolve; });
  let proceed!: () => void; const gate = new Promise<void>(resolve => { proceed = resolve; });
  store.transaction = (async operation => { entered(); await gate; return transaction(operation); }) as typeof store.transaction;
  const deleting = service.delete(profile.id);
  await began;
  expect(() => service.acquire(profile.id)).toThrow('being changed');
  proceed();
  await deleting;
  expect(service.get(profile.id)).toBeUndefined();
});

it('does not carry a provider credential into a different provider profile', async () => {
  const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
  const service = new PlatformProfileService(store);
  const profile = await service.save({ name: 'Anthropic account', provider: 'claude-api', credentialRef: 'vault:v1:11111111-1111-4111-8111-111111111111' });
  await expect(service.save({ ...profile, provider: 'codex-api', expectedRevision: profile.revision })).rejects.toThrow('Clear or replace');
  const changed = await service.save({ ...profile, provider: 'codex-api', credentialRef: undefined, expectedRevision: profile.revision });
  expect(changed.provider).toBe('codex-api');
  expect(changed.credentialRef).toBeUndefined();
});
