import { describe, expect, it, vi } from 'vitest';
import { webSearchSkill } from '../../src/skills/web-search.js';
import { SkillRegistry, type SkillExecutionContext } from '../../src/skills/index.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';

function fixture(overrides: Partial<SkillExecutionContext> = {}) {
  const context: SkillExecutionContext = {
    operator: { operatorId: 'alice', displayName: 'Alice', role: 'operator', workspaceIds: ['*'], source: 'operator-token' },
    signal: new AbortController().signal,
    store: new TransactionalStateStore(new MemorySnapshotBackend()),
    authorize: vi.fn(), executeModel: vi.fn(async () => 'A result with https://example.org/source'),
    ...overrides,
  };
  const registry = new SkillRegistry([webSearchSkill]);
  return { context, execute: (input: unknown) => registry.execute('web-search', input, context) };
}

describe('accounted web search skill', () => {
  it('uses the injected Perplexity executor exactly once with bounded chat arguments', async () => {
    const { context, execute } = fixture();
    const result = await execute({ query: '  What changed?  ' });
    expect(context.authorize).toHaveBeenCalledWith('network', { skill: 'web-search' });
    expect(context.executeModel).toHaveBeenCalledTimes(1);
    const request = vi.mocked(context.executeModel!).mock.calls[0][0];
    expect(request).toMatchObject({ model: 'api-perplexity/sonar', mode: 'chat', effort: 'low', max_tokens: 512 });
    expect(request.messages[1]).toEqual({ role: 'user', content: 'What changed?' });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({ query: 'What changed?', model: 'api-perplexity/sonar', content: 'A result with https://example.org/source' });
  });

  it('accepts the explicit Sonar Pro model and a smaller output allowance', async () => {
    const { context, execute } = fixture();
    await execute({ query: 'Source?', model: 'api-perplexity/sonar-pro', maxOutputTokens: 64 });
    expect(context.executeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'api-perplexity/sonar-pro', max_tokens: 64 }));
  });

  it.each([
    { query: '' }, { query: '   ' }, { query: 'x'.repeat(2001) }, { query: 'bad\0query' },
    { query: 'Question', model: 'cli-codex/model' }, { query: 'Question', model: 'api-perplexity/openai/model' },
    { query: 'Question', model: 'api-perplexity/sonar-deep-research' },
    { query: 'Question', maxOutputTokens: 2048 }, { query: 'Question', maxOutputTokens: 63 },
    { query: 'Question', maxOutputTokens: 64.5 }, { query: 'Question', apiKey: 'input-must-not-supply-a-key' },
  ])('rejects invalid or unbounded search input without dispatch: %j', async input => {
    const { context, execute } = fixture();
    await expect(execute(input)).rejects.toThrow();
    expect(context.executeModel).not.toHaveBeenCalled();
  });

  it('requires host network permission and an accounted execution callback', async () => {
    const denied = fixture({ authorize: () => { throw new Error('Network denied'); } });
    await expect(denied.execute({ query: 'Question' })).rejects.toThrow('Network denied');
    expect(denied.context.executeModel).not.toHaveBeenCalled();
    const missing = fixture({ executeModel: undefined });
    await expect(missing.execute({ query: 'Question' })).rejects.toThrow('accounted model executor');
  });

  it('rejects viewers even when directly invoked outside the registry', async () => {
    const { context } = fixture(); context.operator.role = 'viewer';
    await expect(webSearchSkill.execute({ query: 'Question' }, context)).rejects.toMatchObject({ status: 403 });
    expect(context.executeModel).not.toHaveBeenCalled();
  });

  it('cancels an in-flight accounted call without waiting for a hung executor', async () => {
    const controller = new AbortController();
    const { context, execute } = fixture({ signal: controller.signal, executeModel: vi.fn(() => new Promise<string>(() => {})) });
    const pending = execute({ query: 'Question' });
    await vi.waitFor(() => expect(context.executeModel).toHaveBeenCalledTimes(1));
    controller.abort(new Error('Operator stopped search'));
    await expect(pending).rejects.toThrow('Operator stopped search');
    expect(vi.mocked(context.executeModel!).mock.calls[0][0].signal?.aborted).toBe(true);
  });

  it('rejects excessive provider output instead of returning unbounded content', async () => {
    const { execute } = fixture({ executeModel: vi.fn(async () => 'x'.repeat(257)) });
    await expect(execute({ query: 'Question', maxOutputTokens: 64 })).rejects.toThrow('output allowance');
  });
});
