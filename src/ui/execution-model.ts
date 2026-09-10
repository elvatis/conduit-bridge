import type { PipelineRun } from '../pipelines.js';
import type { PlatformRun } from '../platform-runs.js';

/** Normalize recorded execution evidence for both browser rendering and contract tests. */
export function executionSnapshot(run: PipelineRun | PlatformRun, kind: 'pipeline' | 'agent', now = Date.now()) {
  const pipeline = run as PipelineRun;
  const agent = run as PlatformRun;
  const active = ['running', 'queued', 'waiting_approval'].includes(run.status);
  const terminal = !active;
  const definitions = kind === 'pipeline' ? pipeline.definition?.steps ?? [] : [];
  const rows = kind === 'pipeline'
    ? Object.values(pipeline.stepResults ?? {}).map(step => ({ ...step, id: step.stepId, name: step.stepName, dependencies: definitions.find(item => item.id === step.stepId)?.dependsOn ?? [] }))
    : (agent.steps ?? []).map(step => ({ ...step, id: String(step.iteration), name: `Iteration ${step.iteration}`, model: agent.model, dependencies: [] as string[] }));
  const ids = new Set(rows.map(row => row.id));
  const nodes = rows.map(row => {
    const events = 'events' in row && Array.isArray(row.events) ? row.events : [];
    const dependencies = row.dependencies.filter(id => ids.has(id) && id !== row.id);
    const visited = new Set([row.id]);
    let parent = dependencies[0], depth = 0;
    while (parent && !visited.has(parent) && depth < 8) {
      visited.add(parent); depth++;
      parent = rows.find(item => item.id === parent)?.dependencies[0] ?? '';
    }
    return { ...row, events, commands: events.filter(event => event.kind === 'command'), dependencies, depth, status: terminal && ['pending', 'running'].includes(row.status) ? (row.startedAt ? run.status : 'skipped') : row.status };
  });
  const startedAt = run.startedAt;
  const completedAt = run.completedAt;
  const elapsedMs = startedAt ? Math.max(0, (completedAt ?? (active ? now : startedAt)) - startedAt) : 0;
  return {
    id: run.id, kind, title: kind === 'pipeline' ? pipeline.pipelineName : (agent.prompt || '').split(/\r?\n/)[0].slice(0, 140),
    prompt: kind === 'pipeline' ? pipeline.initialPrompt : agent.prompt,
    status: run.status, nodes, active, startedAt, completedAt, elapsedMs,
    cwd: kind === 'pipeline' ? pipeline.workingDirectory : agent.input?.workingDirectory,
    repository: kind === 'pipeline' ? pipeline.repository : agent.input?.repository,
    error: run.error || (kind === 'agent' ? agent.stopReason : ''),
    contentRetained: kind !== 'pipeline' || pipeline.contentRetained !== false,
    costUsd: run.costUsd, tokens: run.tokensConsumed,
    actions: nodes.filter(node => node.startedAt || ['running','completed','failed'].includes(node.status)).length,
    counts: {
      running: nodes.filter(node => node.status === 'running').length,
      done: nodes.filter(node => node.status === 'completed').length,
      failed: nodes.filter(node => ['failed','cancelled','interrupted','rejected','exhausted'].includes(node.status)).length,
      pending: nodes.filter(node => ['pending','waiting_approval','queued','skipped'].includes(node.status)).length,
    },
  };
}
