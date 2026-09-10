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
  it('exposes live evidence, persists it at completion and forwards selected effort', async () => {
    let finish!: (value: string) => void;
    let sink: Parameters<PlatformRunRuntime['execute']>[0]['onExecutionEvent'];
    let effort: string | undefined;
    const { service } = await setup({ execute: async request => { effort = request.effort; sink = request.onExecutionEvent; return new Promise<string>(resolve => { finish = resolve; }); } });
    const run = await service.create({ prompt: 'Verify source', model: 'lmstudio/test', effort: 'high' });
    for (let i = 0; i < 50 && !sink; i++) await delay(5);
    expect(effort).toBe('high'); expect(sink).toBeTypeOf('function');
    sink!({ kind: 'command', id: 'cmd', command: 'npm test', startedAt: 1, status: 'running' });
    expect(service.get(run.id)?.steps[0].events?.[0]).toMatchObject({ command: 'npm test', status: 'running' });
    sink!({ kind: 'command', id: 'cmd', command: 'npm test', startedAt: 1, completedAt: 2, status: 'completed', exitCode: 0, stdout: 'Tests passed' });
    finish('Done'); const result = await terminal(service, run.id);
    expect(result.steps[0].events).toHaveLength(1);
    expect(result.steps[0].events?.[0]).toMatchObject({ status: 'completed', exitCode: 0, stdout: 'Tests passed' });
    sink!({ kind: 'message', id: 'late', at: 3, text: 'Late event must be ignored' });
    expect(service.get(run.id)?.steps[0].events).toHaveLength(1);
    await expect(service.create({ prompt: 'Invalid', model: 'lmstudio/test', effort: 'infinite' })).rejects.toThrow('effort');
  });
  it('reloads persisted command evidence after a new service starts on the same store', async () => {
    let finish!: (value: string) => void;
    let sink: Parameters<PlatformRunRuntime['execute']>[0]['onExecutionEvent'];
    const { service, store } = await setup({ execute: async request => { sink = request.onExecutionEvent; return new Promise<string>(resolve => { finish = resolve; }); } });
    const run = await service.create({ prompt: 'Keep evidence', model: 'lmstudio/test' });
    for (let i = 0; i < 50 && !sink; i++) await delay(5);
    sink!({ kind: 'command', id: 'cmd', command: 'npm test', startedAt: 1, completedAt: 2, status: 'completed', exitCode: 0, stdout: 'ok' });
    finish('Done');
    await terminal(service, run.id);
    await service.stop();
    const restarted = new PlatformRunService(store, { execute: async () => 'unused' });
    services.push(restarted);
    await restarted.start();
    expect(restarted.get(run.id)?.steps[0].events).toEqual([expect.objectContaining({ kind: 'command', command: 'npm test', exitCode: 0, stdout: 'ok' })]);
  });
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

  it('continues a completed run with follow-up instructions on the same run id', async () => {
    let calls = 0;
    const receivedPrompts: string[] = [];
    const { service } = await setup({
      execute: async request => {
        calls++;
        const lastUser = request.messages.filter(m => m.role === 'user').pop()?.content || '';
        receivedPrompts.push(lastUser);
        return calls === 1 ? 'First iteration result' : 'Second iteration result';
      },
    });

    const run = await service.create({ prompt: 'Implement database schema', model: 'lmstudio/test', maxIterations: 1 });
    const firstDone = await terminal(service, run.id);
    expect(firstDone.status).toBe('completed');
    expect(firstDone.steps).toHaveLength(1);
    expect(firstDone.steps[0].content).toBe('First iteration result');
    expect(calls).toBe(1);

    // Continuing with follow-up
    await service.action(run.id, 'continue', 'operator-1', 'Now add migration script');
    const secondDone = await terminal(service, run.id);
    expect(secondDone.id).toBe(run.id);
    expect(secondDone.status).toBe('completed');
    expect(secondDone.steps).toHaveLength(2);
    expect(secondDone.steps[1].content).toBe('Second iteration result');
    expect(calls).toBe(2);
    expect(receivedPrompts[1]).toContain('Now add migration script');
    expect(secondDone.followUps).toEqual([expect.objectContaining({ prompt: 'Now add migration script', operator: 'operator-1' })]);

    // Active run cannot be continued
    await expect(service.action(run.id, 'continue', 'operator-1', '')).rejects.toThrow('Follow-up instruction is required');
  });

  it('rolls back workspace changes on operator action and automatically when rollbackOnFailure is true', async () => {
    let rollbackCalls = 0;
    let lastRolledBackRun: string | undefined;
    const { service } = await setup({
      execute: async () => 'some result',
      rollback: async r => {
        rollbackCalls++;
        lastRolledBackRun = r.id;
      },
    });

    const run = await service.create({ prompt: 'Task with working dir', model: 'lmstudio/test', workingDirectory: 'C:\\fake\\workspace', maxIterations: 1 });
    await terminal(service, run.id);

    // Rollback action by operator
    await service.action(run.id, 'rollback', 'operator-1');
    expect(rollbackCalls).toBe(1);
    expect(lastRolledBackRun).toBe(run.id);
    expect(service.get(run.id)?.stopReason).toBe('Rolled back by operator');

    // Rollback requires a workingDirectory
    const noDirRun = await service.create({ prompt: 'No cwd', model: 'lmstudio/test', maxIterations: 1 });
    await terminal(service, noDirRun.id);
    await expect(service.action(noDirRun.id, 'rollback', 'operator-1')).rejects.toThrow('working directory');

    // Automatic rollback on failure
    const failingService = (await setup({
      execute: async () => { throw new Error('Simulated failure'); },
      rollback: async r => {
        rollbackCalls++;
        lastRolledBackRun = r.id;
      },
    })).service;

    const autoRollbackRun = await failingService.create({
      prompt: 'Failing run with rollback',
      model: 'lmstudio/test',
      workingDirectory: 'C:\\fake\\workspace',
      rollbackOnFailure: true,
      maxIterations: 1,
    });
    const failedDone = await terminal(failingService, autoRollbackRun.id);
    expect(failedDone.status).toBe('failed');
    expect(rollbackCalls).toBe(2);
    expect(lastRolledBackRun).toBe(autoRollbackRun.id);
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
