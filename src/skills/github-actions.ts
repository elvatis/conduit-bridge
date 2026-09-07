import { setTimeout as delay } from 'node:timers/promises';
import { GitHubApi, githubSegment } from '../github-api.js';
import { requirePlatformCapability } from '../platform-auth.js';
import { abortable } from '../usage.js';
import { SkillError, validateSkillInput, type SkillDefinition, type SkillExecutionContext } from './index.js';

interface WorkflowRun {
  id: number;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  name?: string;
  event?: string;
  head_branch?: string;
  head_sha?: string;
  workflow_id?: number;
  created_at?: string;
  updated_at?: string;
}

function workflowId(value: unknown): string {
  if (Number.isSafeInteger(value) && (value as number) > 0) return String(value);
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === '.' || value === '..') throw new SkillError('workflow must be a positive ID or workflow filename');
  return value;
}
function shortText(value: unknown): string | undefined { return typeof value === 'string' ? value.slice(0, 1000) : undefined; }
function runView(run: WorkflowRun, expectedId?: number) {
  if (!run || !Number.isSafeInteger(run.id) || run.id < 1 || (expectedId !== undefined && run.id !== expectedId)) throw new SkillError('GitHub returned an invalid workflow run identity', 502);
  return {
    id: run.id, status: shortText(run.status), conclusion: run.conclusion === null ? null : shortText(run.conclusion),
    htmlUrl: shortText(run.html_url), name: shortText(run.name), event: shortText(run.event),
    headBranch: shortText(run.head_branch), headSha: shortText(run.head_sha),
    workflowId: Number.isSafeInteger(run.workflow_id) ? run.workflow_id : undefined,
    createdAt: shortText(run.created_at), updatedAt: shortText(run.updated_at),
  };
}
async function authorize(context: SkillExecutionContext, action: string, owner: string, repo: string) {
  context.signal.throwIfAborted();
  requirePlatformCapability(context.operator, 'admin', context.workspace?.id);
  await context.authorize(action === 'dispatch' ? 'write' : 'network', { skill: 'github-actions', action, owner, repo });
  context.signal.throwIfAborted();
}

/** Dispatch workflows or inspect explicitly identified runs through the fixed GitHub API origin. */
export const githubActionsSkill: SkillDefinition = {
  name: 'github-actions',
  description: 'Administrator-only GitHub workflow dispatch and run inspection. Dispatch acceptance does not provide a run ID. List workflow_dispatch candidates or inspect an explicit runId; candidates are never automatically attributed to a dispatch.',
  schema: {
    type: 'object', additionalProperties: false, required: ['action', 'owner', 'repo'],
    properties: {
      action: { type: 'string', enum: ['dispatch', 'get-run', 'list-runs'] },
      owner: { type: 'string', maxLength: 100 }, repo: { type: 'string', maxLength: 100 },
      workflow: { description: 'Workflow filename or positive numeric ID. Required for dispatch; optional for listing.', maxLength: 100 },
      ref: { type: 'string', maxLength: 255, description: 'Branch or tag ref required for dispatch.' },
      inputs: { type: 'object', description: 'At most 10 workflow inputs; every value is a string of at most 1000 characters.' },
      runId: { type: 'integer', minimum: 1, description: 'Exact run ID required for get-run.' },
      waitMs: { type: 'integer', minimum: 0, maximum: 30000, description: 'Optional get-run polling deadline; at most 10 requests, spaced by two seconds.' },
      first: { type: 'integer', minimum: 1, maximum: 30, description: 'Maximum list-runs candidates; defaults to 10.' },
    },
  },
  effect: input => input.action === 'dispatch' ? 'write' : 'network',
  async execute(rawInput, context) {
    const input = validateSkillInput(githubActionsSkill.schema, rawInput);
    requirePlatformCapability(context.operator, 'admin', context.workspace?.id);
    const owner = githubSegment(input.owner, 'owner');
    const repo = githubSegment(input.repo, 'repository');
    const action = input.action as string;
    const allowed = action === 'dispatch' ? ['action', 'owner', 'repo', 'workflow', 'ref', 'inputs'] : action === 'get-run' ? ['action', 'owner', 'repo', 'runId', 'waitMs'] : ['action', 'owner', 'repo', 'workflow', 'first'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new SkillError('Argument is not applicable to this GitHub Actions operation');
    const client = new GitHubApi({ token: context.githubToken });
    const root = `/repos/${owner}/${repo}/actions`;
    if (action === 'dispatch') {
      const workflow = workflowId(input.workflow);
      if (typeof input.ref !== 'string' || !input.ref.trim() || /[\x00-\x1f\x7f]/.test(input.ref)) throw new SkillError('ref must be nonempty text without control characters');
      const inputs = input.inputs as Record<string, unknown> | undefined;
      if (inputs && (Object.keys(inputs).length > 10 || Object.entries(inputs).some(([key, value]) => !key || key.length > 100 || /[\x00-\x1f\x7f]/.test(key) || typeof value !== 'string' || value.length > 1000))) throw new SkillError('Provide at most 10 named string inputs of at most 1000 characters each');
      await authorize(context, action, owner, repo);
      await client.request(`${root}/workflows/${encodeURIComponent(workflow)}/dispatches`, {
        method: 'POST', body: { ref: input.ref, ...(inputs ? { inputs } : {}) }, signal: context.signal,
      });
      return { accepted: true, owner, repo, workflow, ref: input.ref, note: 'GitHub accepted the dispatch without a run ID. Inspect an explicit run ID or list candidates; the newest run is not proof of correspondence.' };
    }
    if (action === 'list-runs') {
      const workflow = input.workflow === undefined ? undefined : workflowId(input.workflow);
      const path = workflow ? `${root}/workflows/${encodeURIComponent(workflow)}/runs` : `${root}/runs`;
      const first = input.first as number | undefined ?? 10;
      await authorize(context, action, owner, repo);
      const result = await client.request<{ workflow_runs: WorkflowRun[] }>(`${path}?event=workflow_dispatch&per_page=${first}`, { signal: context.signal });
      if (!result || !Array.isArray(result.workflow_runs)) throw new SkillError('GitHub returned an invalid workflow run list', 502);
      return { owner, repo, workflow, runs: result.workflow_runs.slice(0, first).map(run => runView(run)), note: 'These are workflow_dispatch candidates, not confirmed matches to a particular dispatch.' };
    }
    if (!Number.isSafeInteger(input.runId) || (input.runId as number) < 1) throw new SkillError('get-run requires a positive runId');
    const runId = input.runId as number;
    const waitMs = input.waitMs as number | undefined ?? 0;
    const deadline = Date.now() + waitMs;
    const timeout = waitMs ? AbortSignal.timeout(waitMs) : undefined;
    const signal = timeout ? AbortSignal.any([context.signal, timeout]) : context.signal;
    let run: ReturnType<typeof runView> | undefined;
    let requests = 0;
    while (requests < 10) {
      try {
        await authorize(context, action, owner, repo);
        signal.throwIfAborted();
        run = runView(await abortable(client.request<WorkflowRun>(`${root}/runs/${runId}`, { signal }), signal), runId);
        requests++;
        if (run.status === 'completed' || !waitMs || requests === 10 || Date.now() + 2000 >= deadline) break;
        await delay(2000, undefined, { signal });
      } catch (error) {
        context.signal.throwIfAborted();
        if (timeout?.aborted && run) break;
        throw error;
      }
    }
    return { owner, repo, run, completed: run?.status === 'completed', requests, pollingStopped: run?.status === 'completed' ? 'completed' : waitMs ? 'bounded-wait' : 'snapshot' };
  },
};
