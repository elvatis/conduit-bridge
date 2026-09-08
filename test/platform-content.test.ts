import { describe, expect, it, vi } from 'vitest';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';
import { PlatformContentService, type ContextInput, type MemoryScope } from '../src/platform-content.js';

async function fixture(now: () => number = Date.now) {
  const backend = new MemorySnapshotBackend();
  const store = new TransactionalStateStore(backend);
  await store.ready();
  return { backend, store, service: new PlatformContentService(store, { now }) };
}
const turn = (input: string, extra: Partial<ContextInput> = {}): ContextInput => ({ input, provider: 'cli-claude', model: 'cli-claude/model-a', maxOutputTokens: 64, ...extra });

describe('platform conversations', () => {
  it('persists chat projects and moves or branches conversations without changing their workspace or transcript', async () => {
    const { service, backend } = await fixture();
    const project = await service.createProject({ name: ' Release planning ', userId: 'alice' });
    const session = await service.createSession({ userId: 'alice', workspaceId: 'trusted-workspace', projectId: project.id });
    await service.runTurn(session.id, turn('Keep this context'), async () => 'Saved context');
    const renamed = await service.updateProject(project.id, { name: 'Launch', expectedRevision: 1 });
    expect(renamed).toMatchObject({ name: 'Launch', revision: 2 });
    await expect(service.updateProject(project.id, { name: 'Stale', expectedRevision: 1 })).rejects.toMatchObject({ status: 409 });
    const reloadedStore = new TransactionalStateStore(backend); await reloadedStore.ready();
    const reloaded = new PlatformContentService(reloadedStore);
    expect(reloaded.listProjects()).toEqual([renamed]);
    expect(reloaded.getSession(session.id)).toMatchObject({ projectId: project.id, workspaceId: 'trusted-workspace', messages: expect.any(Array) });
    const branch = await service.branchSession(session.id);
    expect(branch.projectId).toBe(project.id);
    await expect(service.deleteProject(project.id)).rejects.toMatchObject({ status: 409, code: 'project_not_empty' });
    const moved = await service.updateSession(session.id, { projectId: null, expectedRevision: 3 });
    expect(moved.projectId).toBeUndefined();
    expect(moved.workspaceId).toBe('trusted-workspace');
    expect(moved.messages.map(message => message.content)).toEqual(['Keep this context','Saved context']);
    await service.updateSession(branch.id, { projectId: null });
    await service.deleteProject(project.id);
    expect(service.listProjects()).toEqual([]);
    expect(service.getSession(session.id)?.messages).toHaveLength(2);
  });

  it('rejects missing or foreign projects on both creation and reassignment', async () => {
    const { service } = await fixture();
    const project = await service.createProject({ name: 'Private', userId: 'alice' });
    await expect(service.createSession({ userId: 'bob', projectId: project.id })).rejects.toMatchObject({ status: 404 });
    await expect(service.createSession({ userId: 'alice', projectId: 'missing' })).rejects.toMatchObject({ status: 404 });
    const session = await service.createSession({ userId: 'bob' });
    await expect(service.updateSession(session.id, { projectId: project.id })).rejects.toMatchObject({ status: 404 });
    expect(service.getSession(session.id)?.revision).toBe(1);
    await expect(service.createProject({ name: ' ', userId: 'alice' })).rejects.toThrow();
  });

  it('retains every conversation and reloads it from storage by default', async () => {
    const { backend, store, service } = await fixture();
    const commit = vi.spyOn(backend, 'commit');
    const session = await service.createSession();
    await service.runTurn(session.id, turn('private question'), async () => 'private answer');
    expect(service.getSession(session.id)?.messages).toHaveLength(2);
    expect(store.list('platform.sessions')).toHaveLength(1);
    expect(commit).toHaveBeenCalled();
    expect(new PlatformContentService(store).getSession(session.id)?.messages).toHaveLength(2);
  });

  it('normalizes legacy ephemeral choices without deleting the transcript', async () => {
    const { store, service } = await fixture();
    const session = await service.createSession();
    await service.runTurn(session.id, turn('question'), async () => 'answer');
    const retained = await service.updateSession(session.id, { retention: 'retained', expectedRevision: 3 });
    expect(new PlatformContentService(store).getSession(session.id)?.messages).toHaveLength(2);
    await service.updateSession(session.id, { retention: 'ephemeral', expectedRevision: retained.revision });
    expect(store.read('platform.sessions', session.id)).toMatchObject({ retention: 'retained' });
    expect(service.getSession(session.id)?.messages[1].content).toBe('answer');
  });

  it('updates model selection with revision checks while preserving session identity and history', async () => {
    const { service } = await fixture();
    const session = await service.createSession({ userId: 'alice', workspaceId: 'project', agentId: 'old-agent', profileId: 'old-profile' });
    await service.runTurn(session.id, turn('question'), async () => 'answer');
    const updated = await service.updateSession(session.id, { provider: 'cli-codex', model: 'cli-codex/next', profileId: 'next-profile', agentId: 'next-agent', expectedRevision: 3 });
    expect(updated).toMatchObject({ userId: 'alice', workspaceId: 'project', provider: 'cli-codex', model: 'cli-codex/next', profileId: 'next-profile', agentId: 'next-agent', revision: 4 });
    expect(updated.messages).toHaveLength(2);
    const cleared = await service.updateSession(session.id, { agentId: null, profileId: null });
    expect(cleared.agentId).toBeUndefined(); expect(cleared.profileId).toBeUndefined();
    await expect(service.updateSession(session.id, { model: 'bad\nmodel' })).rejects.toThrow('Invalid model');
  });

  it('switches providers using the canonical transcript and records each turn provenance', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    await service.runTurn(session.id, turn('Remember the design name Orion'), async () => ({ content: 'Design noted', nativeSessionId: 'native-a' }));
    const execute = vi.fn(async () => 'Orion');
    const result = await service.runTurn(session.id, turn('What is its name?', { provider: 'cli-codex', model: 'cli-codex/model-b', profileId: 'profile-b' }), execute);
    expect(execute.mock.calls[0][0].messages.map(m => m.content)).toEqual(['Remember the design name Orion', 'Design noted', 'What is its name?']);
    expect(result.session.messages.map(m => m.provider)).toEqual(['cli-claude', 'cli-claude', 'cli-codex', 'cli-codex']);
    expect(result.session.messages[1].nativeSessionId).toBe('native-a');
    expect(execute.mock.calls[0][0]).not.toHaveProperty('nativeSessionId');
  });

  it('rejects concurrent turns before a second provider dispatch and releases cancellation locks', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    const execute = vi.fn(() => new Promise<string>(() => {}));
    const pending = service.runTurn(session.id, turn('first'), execute);
    await expect(service.runTurn(session.id, turn('second'), execute)).rejects.toMatchObject({ status: 409, code: 'session_busy' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(service.cancelTurn(session.id)).toBe(true);
    await expect(pending).rejects.toThrow('cancelled');
    expect(service.getSession(session.id)?.messages).toEqual([expect.objectContaining({ content: 'first', status: 'interrupted' })]);
    await service.runTurn(session.id, turn('retry'), async () => 'done');
  });

  it('saves failed user requests and refuses dispatch when their durable commit fails', async () => {
    const { service, backend } = await fixture();
    const session = await service.createSession({ retention: 'retained' });
    await expect(service.runTurn(session.id, turn('first'), async () => { throw new Error('provider failed'); })).rejects.toThrow('provider failed');
    vi.spyOn(backend, 'commit').mockRejectedValueOnce(new Error('disk full'));
    const execute = vi.fn(async () => 'answer');
    await expect(service.runTurn(session.id, turn('second'), execute)).rejects.toThrow('disk full');
    expect(execute).not.toHaveBeenCalled();
    expect(service.getSession(session.id)?.messages).toEqual([expect.objectContaining({ content: 'first', status: 'failed' })]);
    await service.runTurn(session.id, turn('third'), async () => 'answer');
    expect(service.getSession(session.id)?.messages).toHaveLength(3);
  });

  it('saves interrupted streamed output and excludes it from the next provider context', async () => {
    const { service, store } = await fixture(); const session = await service.createSession();
    await expect(service.runTurn(session.id, turn('Keep my request'), async (_request, _context, onDelta) => {
      expect(store.read<any>('platform.sessions', session.id).messages[0]).toMatchObject({ content: 'Keep my request', status: 'pending' });
      onDelta('Partial response'); throw new Error('disconnected');
    })).rejects.toThrow('disconnected');
    const reloaded = new PlatformContentService(store);
    expect(reloaded.getSession(session.id)?.messages).toEqual([expect.objectContaining({ status: 'failed', content: 'Keep my request' }), expect.objectContaining({ status: 'interrupted', content: 'Partial response' })]);
    expect(reloaded.prepareContext(session.id, turn('Next')).messages.map(m => m.content)).toEqual(['Next']);
  });

  it('migrates expired legacy conversations and pending messages without erasing text', async () => {
    const { store, service } = await fixture(() => 999999); const session = await service.createSession();
    await store.transaction(tx => tx.put('platform.sessions', session.id, { ...session, retention: 'ephemeral', expiresAt: 1, messages: [{ id: 'pending-message', role: 'user', content: 'Survive restart', provider: 'bitnet', model: 'bitnet/auto', createdAt: 1, status: 'pending' }] }));
    await service.initialize();
    expect(service.getSession(session.id)).toMatchObject({ retention: 'retained', messages: [expect.objectContaining({ content: 'Survive restart', status: 'interrupted' })] });
    expect(store.read<any>('platform.sessions', session.id).expiresAt).toBeUndefined();
    await service.purgeExpired(); expect(service.getSession(session.id)).toBeDefined();
  });

  it('reports omitted whole turns and rejects oversized selected instructions', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    await service.runTurn(session.id, turn('a'.repeat(80)), async () => 'b'.repeat(80));
    await service.runTurn(session.id, turn('recent'), async () => 'recent answer');
    const context = service.prepareContext(session.id, turn('next', { contextTokens: 80, maxOutputTokens: 16 }));
    expect(context.selectedMessageIds).toHaveLength(2);
    expect(context.omittedMessageIds).toHaveLength(2);
    expect(context.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(context.estimatedInputTokens + context.maxOutputTokens).toBeLessThanOrEqual(80);
    expect(() => service.prepareContext(session.id, turn('next', { contextTokens: 80, maxOutputTokens: 16, systemPrompt: 'x'.repeat(1000) }))).toThrow('exceed');
  });

  it('uses explicit summaries, versions edits and branches without mutating the source', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    const first = await service.runTurn(session.id, turn('old question'), async () => 'old answer');
    const summarized = await service.setSummary(session.id, { content: 'Agreed on a small design', throughMessageId: first.assistantMessage.id, expectedRevision: 3 });
    const context = service.prepareContext(session.id, turn('next'));
    expect(context.summaryUsed).toBe(true);
    expect(context.messages[0].content).toContain('Agreed on a small design');
    expect(context.selectedMessageIds).toEqual([]);
    const branch = await service.branchSession(session.id);
    const edited = await service.editMessage(branch.id, first.userMessage.id, 'new question', 1);
    expect(edited.messages).toHaveLength(1);
    expect(edited.messages[0].versions?.[0].content).toBe('old question');
    expect(edited.summary).toBeUndefined();
    expect(service.getSession(session.id)?.messages[0].content).toBe('old question');
    await expect(service.updateSession(session.id, { title: 'Stale', expectedRevision: summarized.revision - 1 })).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(service.exportSession(session.id, 'markdown')).toContain('old answer');
  });

  it('does not dispatch a repeated request ID', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    const execute = vi.fn(async () => 'answer');
    await service.runTurn(session.id, turn('question', { requestId: 'fixed-request' }), execute);
    await expect(service.runTurn(session.id, turn('question', { requestId: 'fixed-request' }), execute)).rejects.toMatchObject({ code: 'duplicate_turn' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('branches before a user turn for retry without duplicating the selected turn', async () => {
    const { service } = await fixture();
    const session = await service.createSession({ userId: 'alice', workspaceId: 'project' });
    const first = await service.runTurn(session.id, turn('first'), async () => 'first answer');
    const second = await service.runTurn(session.id, turn('second'), async () => 'second answer');
    const empty = await service.branchSession(session.id, { beforeMessageId: first.userMessage.id });
    expect(empty.messages).toEqual([]);
    expect(empty).toMatchObject({ userId: 'alice', workspaceId: 'project' });
    const branch = await service.branchSession(session.id, { beforeMessageId: second.userMessage.id });
    expect(branch.messages.map(m => m.content)).toEqual(['first', 'first answer']);
    expect(service.getSession(session.id)?.messages).toHaveLength(4);
    await expect(service.branchSession(session.id, { beforeMessageId: first.userMessage.id, throughMessageId: second.userMessage.id })).rejects.toThrow('either');
  });

  it('accepts composed agent instructions up to 60000 chars while enforcing the destination context allowance', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    expect(service.prepareContext(session.id, turn('question', { systemPrompt: 'x'.repeat(30000), contextTokens: 20000 })).messages[0].content).toHaveLength(30000);
    expect(() => service.prepareContext(session.id, turn('question', { systemPrompt: 'x'.repeat(30000), contextTokens: 1000 }))).toThrow('exceed');
  });

  it('never expires conversations while preserving memory TTL', async () => {
    let now = 1000;
    const { service, store } = await fixture(() => now);
    const ephemeral = await service.createSession({ ttlMs: 1000 });
    const retained = await service.createSession({ ttlMs: 1000, retention: 'retained' });
    const memory = await service.createMemory({ title: 'Temporary', content: 'Expires', scope: 'user', scopeId: 'local-user', ttlMs: 1000 });
    now = 2001;
    expect(service.getSession(ephemeral.id)).toMatchObject({ retention: 'retained' });
    expect(service.getSession(retained.id)).toMatchObject({ retention: 'retained' });
    expect(service.getMemory(memory.id)).toBeUndefined();
    expect(await service.purgeExpired()).toEqual({ sessions: 0, memories: 1 });
    expect(store.list('platform.sessions')).toHaveLength(2);
  });
});

describe('scoped reviewed memories', () => {
  it('requires renewed approval after reviewed memory or its lifetime changes', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    const memory = await service.proposeMemory({ scope: 'user', scopeId: 'local-user', title: 'Decision', content: 'Reviewed value' });
    const approved = await service.approveMemory(memory.id, 1, 'reviewer');
    const edited = await service.updateMemory(memory.id, { content: 'Replacement value', expectedRevision: approved.revision });
    expect(edited.status).toBe('candidate'); expect(edited.reviewedBy).toBeUndefined(); expect(edited.reviewedAt).toBeUndefined();
    expect(() => service.prepareContext(session.id, turn('question', { memoryIds: [memory.id] }))).toThrow('unavailable');
    await service.approveMemory(memory.id, edited.revision, 'reviewer');
    const lifetime = await service.updateMemory(memory.id, { ttlMs: 60000 });
    expect(lifetime.status).toBe('candidate'); expect(lifetime.reviewedBy).toBeUndefined();
  });

  it('binds agent memory to the selected agent and persists that identity after a successful turn', async () => {
    const { service } = await fixture();
    const session = await service.createSession({ agentId: 'previous-agent' });
    const memory = await service.createMemory({ scope: 'agent', scopeId: 'selected-agent', title: 'Fact', content: 'Selected agent fact' });
    const input = turn('question', { agentId: 'selected-agent', memoryIds: [memory.id] });
    expect(service.prepareContext(session.id, input).selectedMemoryIds).toEqual([memory.id]);
    const result = await service.runTurn(session.id, input, async () => 'answer');
    expect(result.session.agentId).toBe('selected-agent');
    expect(() => service.prepareContext(session.id, turn('question', { agentId: 'previous-agent', memoryIds: [memory.id] }))).toThrow('scope');
  });

  it.each<[MemoryScope, string, Partial<ContextInput>, string]>([
    ['user', 'alice', {}, 'bob'],
    ['workspace', 'workspace-a', {}, 'workspace-b'],
    ['agent', 'agent-a', {}, 'agent-b'],
    ['provider', 'cli-claude', {}, 'cli-codex'],
    ['profile', 'profile-a', { profileId: 'profile-a' }, 'profile-b'],
  ])('includes %s memory only for its exact scope', async (scope, scopeId, options, otherScopeId) => {
    const { service } = await fixture();
    const session = await service.createSession({ userId: 'alice', workspaceId: 'workspace-a', agentId: 'agent-a' });
    const memory = await service.createMemory({ scope, scopeId, title: 'Fact', content: 'Use the documented convention' });
    const other = await service.createMemory({ scope, scopeId: otherScopeId, title: 'Other', content: 'Unrelated' });
    const selected = service.prepareContext(session.id, turn('question', { ...options, memoryIds: [memory.id] }));
    expect(selected.selectedMemoryIds).toEqual([memory.id]);
    expect(selected.messages[0].content).toContain('untrusted reference data');
    expect(() => service.prepareContext(session.id, turn('question', { ...options, memoryIds: [other.id] }))).toThrow('scope');
  });

  it('requires candidate approval, records reviewer provenance, and keeps review idempotent', async () => {
    const { service } = await fixture();
    const session = await service.createSession();
    const memory = await service.proposeMemory({ scope: 'user', scopeId: 'local-user', title: 'Decision', content: 'Choose the smaller design', provenance: { sourceType: 'conversation', sourceRef: session.id } });
    expect(() => service.prepareContext(session.id, turn('question', { memoryIds: [memory.id] }))).toThrow('unavailable');
    const approved = await service.approveMemory(memory.id, 1, 'operator');
    expect(approved.reviewedBy).toBe('operator');
    expect(approved.reviewedAt).toBeTypeOf('number');
    expect((await service.approveMemory(memory.id)).revision).toBe(2);
    expect(service.prepareContext(session.id, turn('question', { memoryIds: [memory.id] })).selectedMemoryIds).toEqual([memory.id]);
    await expect(service.updateMemory(memory.id, { content: 'stale', expectedRevision: 1 })).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(await service.deleteMemory(memory.id)).toBe(true);
    expect(service.getMemory(memory.id)).toBeUndefined();
  });
});
