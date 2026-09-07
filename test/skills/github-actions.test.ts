import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { githubActionsSkill } from '../../src/skills/github-actions.js';
import { SkillRegistry, type SkillExecutionContext } from '../../src/skills/index.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
const token = 'github-actions-fixture-secret';
const fetchMock = vi.fn<typeof fetch>();
const input = { owner: 'example', repo: 'project' };
const workflowRun = (id = 41, status = 'completed') => ({
  id, status, conclusion: status === 'completed' ? 'success' : null,
  html_url: `https://github.com/example/project/actions/runs/${id}`, name: 'CI',
  event: 'workflow_dispatch', head_branch: 'main', head_sha: 'abcdef', workflow_id: 8,
});
function fixture(overrides: Partial<SkillExecutionContext> = {}) {
  const context: SkillExecutionContext = {
    operator: { operatorId: 'admin', displayName: 'Admin', role: 'admin', workspaceIds: ['*'], source: 'bridge-token' },
    signal: new AbortController().signal, store: new TransactionalStateStore(new MemorySnapshotBackend()),
    authorize: vi.fn(), githubToken: () => token, ...overrides,
  };
  const registry = new SkillRegistry([githubActionsSkill]);
  return { context, execute: (args: unknown) => registry.execute('github-actions', args, context) as Promise<any> };
}
beforeEach(() => {
  fetchMock.mockReset(); vi.mocked(delay).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('GitHub Actions executable skill', () => {
  it('dispatches once to the fixed origin and reports acceptance without inventing a run ID', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { context, execute } = fixture();
    const result = await execute({ ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'feature/check', inputs: { environment: 'test' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.github.com/repos/example/project/actions/workflows/ci.yml/dispatches');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
    expect(JSON.parse(options!.body as string)).toEqual({ ref: 'feature/check', inputs: { environment: 'test' } });
    expect(context.authorize).toHaveBeenCalledWith('write', { skill: 'github-actions', action: 'dispatch', ...input });
    expect(result).toMatchObject({ accepted: true, workflow: 'ci.yml', ref: 'feature/check' });
    expect(result).not.toHaveProperty('runId'); expect(result.note).toContain('without a run ID');
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('accepts a numeric workflow ID and defaults to the environment resolver when none is supplied', async () => {
    vi.stubEnv('GITHUB_TOKEN', token);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { execute } = fixture({ githubToken: undefined });
    expect((await execute({ ...input, action: 'dispatch', workflow: 82, ref: 'main' })).accepted).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/workflows/82/dispatches');
  });

  it('returns workflow_dispatch candidates without treating the latest as the dispatched run', async () => {
    fetchMock.mockResolvedValue(Response.json({ workflow_runs: [workflowRun(99), workflowRun(41)] }));
    const { execute } = fixture();
    const result = await execute({ ...input, action: 'list-runs', workflow: 'ci.yml', first: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.github.com/repos/example/project/actions/workflows/ci.yml/runs?event=workflow_dispatch&per_page=1');
    expect(result.runs.map((run: any) => run.id)).toEqual([99]);
    expect(result.note).toContain('not confirmed matches');
    expect(result).not.toHaveProperty('runId');
  });

  it('reads only an explicit run ID and returns a bounded snapshot', async () => {
    fetchMock.mockResolvedValue(Response.json(workflowRun()));
    const { execute } = fixture();
    const result = await execute({ ...input, action: 'get-run', runId: 41 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.github.com/repos/example/project/actions/runs/41');
    expect(result).toMatchObject({ completed: true, requests: 1, run: { id: 41, conclusion: 'success', headBranch: 'main' } });
  });

  it('polls the same run at two-second intervals and stops on completion', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(workflowRun(41, 'in_progress'))).mockResolvedValueOnce(Response.json(workflowRun()));
    const { execute } = fixture();
    const result = await execute({ ...input, action: 'get-run', runId: 41, waitMs: 30000 });
    expect(result).toMatchObject({ completed: true, requests: 2 });
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/runs/41'))).toBe(true);
    expect(delay).toHaveBeenCalledWith(2000, undefined, { signal: expect.any(AbortSignal) });
  });

  it('stops after ten polls while preserving the last known status', async () => {
    fetchMock.mockImplementation(async () => Response.json(workflowRun(41, 'queued')));
    const { execute } = fixture();
    const result = await execute({ ...input, action: 'get-run', runId: 41, waitMs: 30000 });
    expect(fetchMock).toHaveBeenCalledTimes(10); expect(delay).toHaveBeenCalledTimes(9);
    expect(result).toMatchObject({ completed: false, requests: 10, pollingStopped: 'bounded-wait', run: { status: 'queued' } });
  });

  it('does not schedule another poll when less than two seconds remain', async () => {
    fetchMock.mockResolvedValue(Response.json(workflowRun(41, 'queued')));
    const { execute } = fixture();
    expect((await execute({ ...input, action: 'get-run', runId: 41, waitMs: 1000 })).completed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(delay).not.toHaveBeenCalled();
  });

  it('cancels polling and rechecks repository policy before each request', async () => {
    fetchMock.mockImplementation(async () => Response.json(workflowRun(41, 'queued')));
    const controller = new AbortController();
    vi.mocked(delay).mockImplementationOnce(async () => { controller.abort(new Error('Stopped')); });
    const { execute } = fixture({ signal: controller.signal });
    await expect(execute({ ...input, action: 'get-run', runId: 41, waitMs: 30000 })).rejects.toThrow('Stopped');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear(); vi.mocked(delay).mockResolvedValue(undefined);
    let checks = 0;
    const denied = fixture({ authorize: (_effect, details) => { if (details?.action && ++checks === 2) throw new Error('Repository permission revoked'); } });
    await expect(denied.execute({ ...input, action: 'get-run', runId: 41, waitMs: 30000 })).rejects.toThrow('permission revoked');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-admin direct callers and repository policy denial without network access', async () => {
    const { context } = fixture(); context.operator.role = 'operator';
    await expect(githubActionsSkill.execute({ ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main' }, context)).rejects.toMatchObject({ status: 403 });
    const denied = fixture({ authorize: () => { throw new Error('Repository denied'); } });
    await expect(denied.execute({ ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main' })).rejects.toThrow('Repository denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, action: 'dispatch', workflow: '../ci.yml', ref: 'main' },
    { ...input, action: 'dispatch', workflow: '..', ref: 'main' },
    { ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main\nother' },
    { ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'x'.repeat(256) },
    { ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main', inputs: { count: 1 } },
    { ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main', inputs: { text: 'x'.repeat(1001) } },
    { ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main', inputs: Object.fromEntries(Array.from({ length: 11 }, (_, i) => ['key' + i, 'value'])) },
    { ...input, owner: '../other', action: 'get-run', runId: 41 },
    { ...input, action: 'get-run' }, { ...input, action: 'get-run', runId: 41, waitMs: 30001 },
    { ...input, action: 'get-run', runId: 41, ref: 'ignored' },
    { ...input, action: 'list-runs', first: 31 },
  ])('rejects invalid or unbounded arguments without network access: %j', async args => {
    const { execute } = fixture();
    await expect(execute(args)).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry failed dispatches or expose upstream credential text', async () => {
    fetchMock.mockResolvedValue(new Response(`Upstream included ${token}`, { status: 403 }));
    const { execute } = fixture();
    const error = await execute({ ...input, action: 'dispatch', workflow: 'ci.yml', ref: 'main' }).catch(value => value);
    expect(error.status).toBe(403); expect(error.message).not.toContain(token); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a response for another run instead of misattributing status', async () => {
    fetchMock.mockResolvedValue(Response.json(workflowRun(99)));
    const { execute } = fixture();
    await expect(execute({ ...input, action: 'get-run', runId: 41 })).rejects.toThrow('workflow run identity');
  });
});
