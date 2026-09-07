import { describe, expect, it, vi } from 'vitest';
import { memorySkill } from '../../src/skills/memory.js';
import { SkillRegistry, type SkillExecutionContext } from '../../src/skills/index.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';

async function fixture(overrides: Partial<SkillExecutionContext> = {}) {
  const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
  const context: SkillExecutionContext = {
    operator: { operatorId: 'alice', displayName: 'Alice', role: 'operator', workspaceIds: ['workspace-a'], source: 'operator-token' },
    workspace: { id: 'workspace-a', root: '/authorized-workspace' },
    signal: new AbortController().signal, store, authorize: vi.fn(), ...overrides,
  };
  const registry = new SkillRegistry([memorySkill]);
  return { store, context, execute: (input: unknown, selected = context) => registry.execute('memory', input, selected) as Promise<any> };
}

describe('scoped key/value memory skill', () => {
  it('stores JSON in the shared platform store, lists metadata, and never creates reviewed memory', async () => {
    const { store, context, execute } = await fixture();
    const saved = await execute({ action: 'set', key: 'design', value: { name: 'Orion', flags: [true, null, 2] } });
    expect(saved.entry).toMatchObject({ scope: 'user', scopeId: 'alice', revision: 1, value: { name: 'Orion', flags: [true, null, 2] } });
    const loaded = await execute({ action: 'get', key: 'design' });
    expect(loaded.entry).toEqual(saved.entry);
    loaded.entry.value.name = 'Caller mutation';
    expect((await execute({ action: 'get', key: 'design' })).entry.value.name).toBe('Orion');
    const list = await execute({ action: 'list' });
    expect(list.entries).toEqual([{ key: 'design', revision: 1, createdAt: saved.entry.createdAt, updatedAt: saved.entry.updatedAt }]);
    expect(context.authorize).toHaveBeenCalledWith('write', { skill: 'memory' });
    expect(context.authorize).toHaveBeenCalledWith('read', { skill: 'memory' });
    expect(store.list('platform.memories')).toEqual([]);
  });

  it('isolates owners and rejects caller-supplied owner or scope IDs', async () => {
    const { context, execute } = await fixture();
    await execute({ action: 'set', key: 'private', value: 'Alice only' });
    const bob = { ...context, operator: { ...context.operator, operatorId: 'bob' } };
    expect((await execute({ action: 'get', key: 'private' }, bob)).entry).toBeNull();
    expect((await execute({ action: 'list' }, bob)).entries).toEqual([]);
    expect((await execute({ action: 'delete', key: 'private' }, bob)).deleted).toBe(false);
    await expect(execute({ action: 'get', key: 'private', scopeId: 'alice' }, bob)).rejects.toThrow('Unknown tool argument');
    await expect(execute({ action: 'set', key: 'private', value: 'Other', ownerId: 'alice' }, bob)).rejects.toThrow('Unknown tool argument');
    expect((await execute({ action: 'get', key: 'private' })).entry.value).toBe('Alice only');
  });

  it('shares only the authorized workspace namespace and requires its scope permission', async () => {
    const { context, execute } = await fixture();
    await execute({ action: 'set', scope: 'workspace', key: 'decision', value: 'Shared fact' });
    const bob = { ...context, operator: { ...context.operator, operatorId: 'bob' } };
    expect((await execute({ action: 'get', scope: 'workspace', key: 'decision' }, bob)).entry.value).toBe('Shared fact');
    expect((await execute({ action: 'get', key: 'decision' }, bob)).entry).toBeNull();
    const unauthorized = { ...bob, workspace: { id: 'workspace-b', root: '/other' } };
    await expect(execute({ action: 'get', scope: 'workspace', key: 'decision' }, unauthorized)).rejects.toMatchObject({ status: 403 });
    await expect(execute({ action: 'list', scope: 'workspace' }, { ...context, workspace: undefined })).rejects.toThrow('authorized workspace');
  });

  it('detects stale concurrent replacements and requires current revision for deletion', async () => {
    const { execute } = await fixture();
    await execute({ action: 'set', key: 'revision', value: 1, expectedRevision: 0 });
    await expect(execute({ action: 'set', key: 'revision', value: 2 })).rejects.toMatchObject({ status: 409 });
    const contenders = await Promise.allSettled([
      execute({ action: 'set', key: 'revision', value: 2, expectedRevision: 1 }),
      execute({ action: 'set', key: 'revision', value: 3, expectedRevision: 1 }),
    ]);
    expect(contenders.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(contenders.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await execute({ action: 'get', key: 'revision' })).entry.revision).toBe(2);
    await expect(execute({ action: 'delete', key: 'revision', expectedRevision: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await execute({ action: 'delete', key: 'revision', expectedRevision: 2 })).deleted).toBe(true);
    expect((await execute({ action: 'get', key: 'revision' })).entry).toBeNull();
  });

  it('allows viewer reads but denies writes even outside registry invocation', async () => {
    const { context, execute } = await fixture();
    const viewer = { ...context, operator: { ...context.operator, role: 'viewer' as const } };
    expect((await execute({ action: 'list' }, viewer)).entries).toEqual([]);
    await expect(memorySkill.execute({ action: 'set', key: 'x', value: 1 }, viewer)).rejects.toMatchObject({ status: 403 });
  });

  it('does not read or write after cancellation or host policy denial', async () => {
    const controller = new AbortController(); controller.abort(new Error('Cancelled'));
    const cancelled = await fixture({ signal: controller.signal });
    await expect(cancelled.execute({ action: 'set', key: 'x', value: 1 })).rejects.toThrow('Cancelled');
    expect(cancelled.store.list('skills.memory')).toEqual([]);
    const denied = await fixture({ authorize: () => { throw new Error('Write not allowed'); } });
    await expect(denied.execute({ action: 'set', key: 'x', value: 1 })).rejects.toThrow('Write not allowed');
    expect(denied.store.list('skills.memory')).toEqual([]);
  });

  it.each([
    { action: 'set', key: '', value: 1 }, { action: 'set', key: 'x'.repeat(101), value: 1 },
    { action: 'set', key: 'x\nother', value: 1 }, { action: 'set', key: 'x' },
    { action: 'set', key: 'x', value: '界'.repeat(5500) },
    { action: 'get', key: 'x', value: 'unexpected' }, { action: 'set', key: 'x', value: 1, scope: 'provider' },
    { action: 'get', key: 'x', expectedRevision: -1 },
  ])('rejects invalid or oversize arguments without state changes: %j', async input => {
    const { store, execute } = await fixture();
    await expect(execute(input)).rejects.toThrow();
    expect(store.list('skills.memory')).toEqual([]);
  });

  it('rejects non-JSON values when invoked directly', async () => {
    const { context } = await fixture();
    for (const value of [undefined, Number.NaN, Infinity, new Date(), { missing: undefined }, 1n]) {
      await expect(memorySkill.execute({ action: 'set', key: 'invalid', value }, context)).rejects.toThrow('JSON');
    }
    const cycle: any = {}; cycle.self = cycle;
    await expect(memorySkill.execute({ action: 'set', key: 'invalid', value: cycle }, context)).rejects.toThrow('cycles');
  });

  it('bounds each scope to 100 entries while allowing replacements and other owners', async () => {
    const { context, execute } = await fixture();
    for (let i = 0; i < 100; i++) await execute({ action: 'set', key: String(i), value: i });
    await expect(execute({ action: 'set', key: 'overflow', value: 1 })).rejects.toThrow('100 entry limit');
    expect((await execute({ action: 'set', key: '0', value: 'replacement', expectedRevision: 1 })).entry.revision).toBe(2);
    const bob = { ...context, operator: { ...context.operator, operatorId: 'bob' } };
    expect((await execute({ action: 'set', key: 'new', value: 1 }, bob)).entry.revision).toBe(1);
    expect((await execute({ action: 'list' })).entries).toHaveLength(100);
  });
});
