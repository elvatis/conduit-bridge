import { describe, expect, it, vi } from 'vitest';
import { SkillRegistry, type SkillDefinition, type SkillExecutionContext } from '../../src/skills/index.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';

describe('executable skill registry', () => {
  const skill: SkillDefinition = { name: 'fixture', description: 'Fixture', effect: 'write', schema: { type: 'object', additionalProperties: false, required: ['count'], properties: { count: { type: 'integer', minimum: 1, maximum: 3 } } }, execute: async input => input.count };
  const context = (): SkillExecutionContext => ({ operator: { operatorId: 'admin', role: 'admin', workspaceIds: ['*'], source: 'operator-token', displayName: 'Test' }, signal: new AbortController().signal, store: new TransactionalStateStore(new MemorySnapshotBackend()), authorize: vi.fn() });
  it('validates before policy and execution, and refuses unknown tools', async () => {
    const registry = new SkillRegistry([skill]); const ctx = context();
    await expect(registry.execute('fixture', { count: 4 }, ctx)).rejects.toThrow('range');
    await expect(registry.execute('fixture', { count: 1, extra: true }, ctx)).rejects.toThrow('Unknown tool argument');
    await expect(registry.execute('missing', {}, ctx)).rejects.toThrow('not found');
    expect(ctx.authorize).not.toHaveBeenCalled();
    expect(await registry.execute('fixture', { count: 2 }, ctx)).toBe(2);
    expect(ctx.authorize).toHaveBeenCalledWith('write', { skill: 'fixture' });
  });
  it('does not execute after denied authorization or cancellation', async () => {
    const execute = vi.fn(); const registry = new SkillRegistry([{ ...skill, execute }]); const ctx = context();
    ctx.authorize = () => { throw new Error('denied'); };
    await expect(registry.execute('fixture', { count: 1 }, ctx)).rejects.toThrow('denied');
    await expect(registry.execute('fixture', { count: 1 }, { ...ctx, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps returned schema edits and duplicate registration from changing tools', () => {
    const registry = new SkillRegistry([skill]); registry.list()[0].schema.properties.count.maximum = 99;
    expect(registry.list()[0].schema.properties.count.maximum).toBe(3);
    expect(() => registry.register(skill)).toThrow('duplicate');
  });
});
