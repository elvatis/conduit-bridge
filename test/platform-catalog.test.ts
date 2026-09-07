import { describe, expect, it, vi } from 'vitest';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';
import { PlatformCatalogService } from '../src/platform-catalog.js';

async function fixture() {
  const backend = new MemorySnapshotBackend();
  const store = new TransactionalStateStore(backend); await store.ready();
  return { backend, store, catalog: new PlatformCatalogService(store) };
}
describe('versioned instruction catalog', () => {
  it('offers useful builtins without touching durable storage', async () => {
    const { backend, catalog } = await fixture();
    const commit = vi.spyOn(backend, 'commit');
    expect(catalog.listSkills()).toHaveLength(12);
    expect(catalog.listPrompts()).toHaveLength(8);
    expect(catalog.getSkill('minimal-implementation')?.modes).toEqual(['agent']);
    expect(commit).not.toHaveBeenCalled();
  });
  it('pins agents to immutable versions even after a catalog update', async () => {
    const { catalog } = await fixture();
    const first = await catalog.saveSkill({ id: 'team-style', name: 'Team style', body: 'Version one', modes: ['chat'], expectedVersion: 0 });
    const agent = await catalog.saveAgent({ name: 'Reviewer', instructions: 'Review carefully', skillRefs: [{ id: first.id, version: first.version }] });
    await catalog.saveSkill({ id: first.id, name: first.name, body: 'Version two', modes: ['chat'], expectedVersion: 1 });
    const resolved = catalog.resolveAgent(agent.id);
    expect(resolved.instructions).toContain('Version one');
    expect(resolved.instructions).not.toContain('Version two');
    expect(catalog.getSkill(first.id)?.version).toBe(2);
    expect(catalog.listSkillVersions(first.id)).toHaveLength(2);
    resolved.skills[0].body = 'tampered';
    expect(catalog.resolveAgent(agent.id).instructions).toContain('Version one');
  });
  it('rejects incompatible modes and unavailable tools before execution', async () => {
    const { catalog } = await fixture();
    await expect(catalog.saveAgent({ name: 'Wrong mode', mode: 'chat', skillRefs: [{ id: 'minimal-implementation', version: 1 }] })).rejects.toMatchObject({ code: 'mode_mismatch' });
    const agent = await catalog.saveAgent({ name: 'Coder', mode: 'agent', skillRefs: [{ id: 'minimal-implementation', version: 1 }] });
    expect(() => catalog.resolveAgent(agent.id, { availableTools: ['Read'] })).toThrow('unavailable tools: Edit');
    expect(catalog.resolveAgent(agent.id, { availableTools: ['Read', 'Edit'] }).requiredTools).toEqual(['Read', 'Edit']);
    expect(() => catalog.resolveAgent(agent.id, { mode: 'chat', availableTools: ['Read', 'Edit'] })).toThrow('does not support');
  });
  it('serializes version creation and detects conflicting editors', async () => {
    const { catalog } = await fixture();
    await catalog.savePrompt({ id: 'custom-prompt', name: 'Prompt', body: 'initial' });
    const saves = await Promise.allSettled([
      catalog.savePrompt({ id: 'custom-prompt', name: 'Prompt', body: 'left', expectedVersion: 1 }),
      catalog.savePrompt({ id: 'custom-prompt', name: 'Prompt', body: 'right', expectedVersion: 1 }),
    ]);
    expect(saves.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(saves.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(catalog.listPromptVersions('custom-prompt').map(item => item.version)).toEqual([2, 1]);
  });
  it('archives catalog items without destroying their version history or silently executing them', async () => {
    const { catalog } = await fixture();
    const agent = await catalog.saveAgent({ name: 'Reviewer', promptRefs: [{ id: 'change-review', version: 1 }] });
    expect(await catalog.deletePrompt('change-review')).toBe(true);
    expect(catalog.getPrompt('change-review')).toBeUndefined();
    expect(catalog.listPromptVersions('change-review')).toHaveLength(1);
    expect(() => catalog.resolveAgent(agent.id)).toThrow('missing or archived');
  });
  it('validates attachments, tools and revisions', async () => {
    const { catalog } = await fixture();
    await expect(catalog.saveSkill({ name: 'Invalid', body: 'x', requiredTools: ['imaginary-tool'] })).rejects.toThrow('known bridge tools');
    await expect(catalog.saveAgent({ name: 'Unpinned', skillRefs: [{ id: 'change-review', version: 0 }] })).rejects.toThrow('pin');
    await expect(catalog.saveAgent({ name: 'Missing', skillRefs: [{ id: 'missing', version: 1 }] })).rejects.toThrow('missing');
    const agent = await catalog.saveAgent({ name: 'Agent' });
    await catalog.saveAgent({ ...agent, name: 'Renamed', expectedRevision: 1 });
    await expect(catalog.saveAgent({ ...agent, name: 'Stale', expectedRevision: 1 })).rejects.toMatchObject({ code: 'revision_conflict' });
  });

  it('prevents an explicitly pinned agent provider from being replaced at execution', async () => {
    const { catalog } = await fixture();
    const agent = await catalog.saveAgent({ name: 'Pinned reviewer', provider: 'cli-codex' });
    expect(() => catalog.resolveAgent(agent.id, { provider: 'cli-claude' })).toThrow('pinned to provider');
    expect(catalog.resolveAgent(agent.id, { provider: 'cli-codex' }).agent.id).toBe(agent.id);
  });
});
