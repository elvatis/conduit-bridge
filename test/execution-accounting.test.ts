import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetManager } from '../src/budget.js';
import { MetricsStore } from '../src/metrics.js';
import { executeWithAccounting, openExecution, estimateCost } from '../src/usage.js';
import { PipelineStore, runPipeline, validatePipeline, interpolatePrompt, type PipelineDefinition } from '../src/pipelines.js';
import type { ProviderAdapter } from '../src/types.js';
import type { ProviderRegistry } from '../src/registry.js';

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'conduit-accounting-')); });
afterEach(() => { vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }); });
const step = (id: string, extra = {}) => ({ id, name: id, model: 'cli-codex/test', max_tokens: 16, promptTemplate: id, ...extra });
const definition = (steps: PipelineDefinition['steps']): PipelineDefinition => ({ id: 'review-test', name: 'Test', description: 'Mock only', steps });
function fixture() {
  const chat = vi.fn(async () => 'result');
  const provider = { name: 'cli-codex', models: [], ensureConnected: vi.fn(async () => true), chat } as unknown as ProviderAdapter;
  const registry = { providerForModel: () => provider } as unknown as ProviderRegistry;
  const budget = new BudgetManager({}, join(directory, 'budget.json'));
  const metrics = new MetricsStore(join(directory, 'metrics.json'));
  return { chat, provider, registry, budget, metrics };
}

describe('Fast mode budget admission', () => {
  it('reserves the higher estimate before calling the provider and preserves standard-speed admission', async () => {
    const {provider,chat} = fixture();
    const request = {model:'cli-codex/gpt-5.6-sol',messages:[{role:'user' as const,content:'test'}],max_tokens:16};
    const standard = estimateCost(request.model,1,16);
    const budget = new BudgetManager({dailyBudgetUsd:standard * 2,hardStop:true},join(directory,'fast-budget.json'));
    await expect(executeWithAccounting(provider,{...request,fastMode:true},{budgetManager:budget})).rejects.toThrow('Daily budget');
    expect(chat).not.toHaveBeenCalled();
    expect(await executeWithAccounting(provider,{...request,fastMode:false},{budgetManager:budget})).toBe('result');
    expect(chat).toHaveBeenCalledOnce();
  });
});

describe('pipeline execution regressions', () => {
  it('executes the approved step exactly once and uses its frozen definition', async () => {
    const { chat, registry } = fixture();
    const pipeline = definition([step('draft'), step('approval', { requiresApproval: true }), step('final', { dependsOn: ['approval'], promptTemplate: '{{previous_output}}' })]);
    const paused = await runPipeline(pipeline, 'work', registry);
    expect(chat).toHaveBeenCalledTimes(1);
    pipeline.steps[1].promptTemplate = 'tampered';
    const completed = await runPipeline(pipeline, 'changed', registry, { existingRun: paused, approvedStepId: 'approval' });
    expect(completed.status).toBe('completed');
    expect(chat).toHaveBeenCalledTimes(3);
    expect(chat.mock.calls[1][0].messages[0].content).toBe('approval');
    expect(chat.mock.calls[2][0].messages[0].content).toBe('result');
    expect(completed.stepResults.approval.content).toBe('result');
    expect(completed.stepResults.approval.startedAt).toBeDefined();
    await expect(runPipeline(pipeline, 'work', registry, { existingRun: completed, approvedStepId: 'approval' })).rejects.toThrow('Only a waiting');
  });

  it('rejects an approval for a different step without any provider call', async () => {
    const { chat, registry } = fixture();
    const pipeline = definition([step('approval', { requiresApproval: true })]);
    const paused = await runPipeline(pipeline, 'work', registry);
    await expect(runPipeline(pipeline, 'work', registry, { existingRun: paused, approvedStepId: 'other' })).rejects.toThrow('must match');
    expect(chat).not.toHaveBeenCalled();
  });

  it('schedules an out-of-order DAG and rejects missing, duplicate and cyclic IDs', async () => {
    const { chat, registry } = fixture();
    const run = await runPipeline(definition([step('child', { dependsOn: ['parent'] }), step('parent')]), 'work', registry);
    expect(run.status).toBe('completed');
    expect(chat.mock.calls.map(call => call[0].messages[0].content)).toEqual(['parent', 'child']);
    expect(() => validatePipeline(definition([step('a', { dependsOn: ['missing'] })]))).toThrow('Unknown');
    expect(() => validatePipeline(definition([step('a'), step('a')]))).toThrow('unique');
    expect(() => validatePipeline(definition([step('a', { dependsOn: ['b'] }), step('b', { dependsOn: ['a'] })]))).toThrow('cycle');
  });

  it('persists progress before dispatch and marks an interrupted worker after restart', async () => {
    const { provider, registry } = fixture();
    const store = new PipelineStore(join(directory, 'pipelines.json'), join(directory, 'runs.json'));
    const snapshots: string[] = [];
    provider.chat = async () => {
      const reloaded = new PipelineStore(join(directory, 'pipelines.json'), join(directory, 'runs.json'));
      expect(reloaded.listRuns()[0].status).toBe('interrupted');
      return 'result';
    };
    const run = await runPipeline(definition([step('first')]), 'work', registry, { onRunUpdate: value => { snapshots.push(value.stepResults.first.status); store.recordRun(value); } });
    expect(run.status).toBe('completed');
    expect(snapshots).toContain('running');
    expect(store.listRuns()[0].status).toBe('completed');
  });

  it('retains active runs while trimming terminal history and reserves preset IDs', () => {
    const store = new PipelineStore(join(directory, 'pipelines.json'), join(directory, 'runs.json'));
    expect(() => store.savePipeline({ ...definition([step('first')]), id: 'pr-review' })).toThrow('reserved');
    for (let i = 0; i < 55; i++) store.recordRun({ id: String(i), pipelineId: 'p', pipelineName: 'p', initialPrompt: 'x', status: i === 0 ? 'waiting_approval' : 'completed', startedAt: i, stepResults: {} });
    expect(store.listRuns()).toHaveLength(50);
    expect(store.getRun('0')).toBeDefined();
  });

  it('keeps live approval context but persists only summaries and interrupts approvals after restart', async () => {
    const { registry } = fixture();
    const definitions = join(directory, 'definitions.json');
    const history = join(directory, 'history.json');
    const store = new PipelineStore(definitions, history);
    const run = await runPipeline(definition([step('draft'), step('approval', { requiresApproval: true })]), 'PRIVATE_INPUT', registry, { onRunUpdate: value => store.recordRun(value) });
    expect(store.getRun(run.id)?.initialPrompt).toBe('PRIVATE_INPUT');
    expect(store.getRun(run.id)?.stepResults.draft.content).toBe('result');
    const disk = readFileSync(history, 'utf8');
    expect(disk).not.toContain('PRIVATE_INPUT');
    expect(JSON.parse(disk)[0].stepResults.draft.content).toBeUndefined();
    expect(JSON.parse(disk)[0].definition).toBeUndefined();
    const reloaded = new PipelineStore(definitions, history).getRun(run.id)!;
    expect(reloaded.status).toBe('interrupted');
    expect(reloaded.contentRetained).toBe(false);
    expect(reloaded.stepResults.approval.status).toBe('failed');
  });

  it('counts one pipeline run and all provider attempts with the same cost estimate', async () => {
    const { registry, budget, metrics } = fixture();
    const run = await runPipeline(definition([step('one'), step('two'), step('three')]), 'work', registry, { budgetManager: budget, metrics });
    const usage = budget.getUsage();
    expect(run.status).toBe('completed');
    expect(usage.totalRunsToday).toBe(1);
    expect(usage.requestAttemptsToday).toBe(3);
    expect(metrics.snapshot()['cli-codex/test'].requests).toBe(3);
    expect(usage.currentDailyCostUsd).toBeCloseTo(run.costUsd!);
    expect(metrics.snapshot()['cli-codex/test'].estimatedCostUsd).toBeCloseTo(run.costUsd!);
  });

  it('blocks dispatch when the pipeline cannot reserve its budget', async () => {
    const { chat, registry, budget } = fixture();
    budget.updateConfig({ maxCostPerRunUsd: 0.000001 });
    const run = await runPipeline(definition([step('one')]), 'work', registry, { budgetManager: budget });
    expect(run.status).toBe('failed');
    expect(chat).not.toHaveBeenCalled();
  });

  it('fails an oversized final output and accounts its actual estimated consumption', async () => {
    const { provider, registry, budget, metrics } = fixture();
    provider.chat = async () => 'x'.repeat(100);
    const run = await runPipeline(definition([step('one', { max_tokens: 2 })]), 'work', registry, { budgetManager: budget, metrics });
    expect(run.status).toBe('failed');
    expect(run.stepResults.one.error).toContain('8 character limit');
    expect(run.tokensConsumed).toBe(26);
    expect(run.tokensConsumed).toBe(budget.getUsage().totalTokensToday);
    expect(metrics.snapshot()['cli-codex/test'].failures).toBe(1);
  });

  it('cancels a provider that ignores AbortSignal and records a terminal run', async () => {
    const { provider, registry } = fixture();
    const cancellation = new AbortController();
    provider.chat = async () => { cancellation.abort(new Error('operator cancelled')); return new Promise(() => {}); };
    const run = await runPipeline(definition([step('one')]), 'work', registry, { signal: cancellation.signal });
    expect(run.status).toBe('cancelled');
    expect(run.completedAt).toBeDefined();
  });

  it('enforces a deadline when a provider never settles', async () => {
    const { provider, registry, budget } = fixture();
    budget.updateConfig({ maxDurationMs: 5 });
    provider.chat = async () => new Promise(() => {});
    const run = await runPipeline(definition([step('one')]), 'work', registry, { budgetManager: budget });
    expect(run.status).toBe('failed');
    expect(run.stepResults.one.error).toContain('deadline');
  });

  it('catches provider connection errors and forwards effective policy and workspace', async () => {
    const { provider, registry } = fixture();
    provider.ensureConnected = async () => { throw new Error('connection failed'); };
    const run = await runPipeline(definition([step('one')]), 'work', registry);
    expect(run.status).toBe('failed');
    expect(run.stepResults.one.error).toBe('connection failed');
  });

  it('interpolates dollar replacement characters literally', () => {
    expect(interpolatePrompt('Task: {{prompt}}', '$& $$', {})).toBe('Task: $& $$');
  });
});

describe('budget reservations and accounting', () => {
  it('prevents concurrent overspend and settles idempotently', () => {
    const { budget } = fixture();
    budget.updateConfig({ dailyBudgetUsd: 0.01, maxCostPerRunUsd: 1 });
    const reserve = (runId: string) => budget.reserve({ runId, provider: 'cli-codex', model: 'm', estimatedTokens: 5, estimatedCostUsd: 0.006 });
    const first = reserve('first');
    expect(() => reserve('second')).toThrow('Daily budget');
    budget.settle(first.reservationId, { tokens: 3, costUsd: 0.002 });
    budget.settle(first.reservationId, { tokens: 3, costUsd: 0.002 });
    expect(budget.getUsage().currentDailyCostUsd).toBe(0.002);
    expect(() => reserve('third')).not.toThrow();
  });

  it('enforces daily provider and model ceilings, cumulative run limits, and repository overrides', () => {
    const { budget } = fixture();
    budget.updateConfig({ providerLimits: { 'cli-codex': 0.01 }, modelLimits: { m: 0.005 } });
    expect(() => budget.reserve({ runId: 'r', provider: 'cli-codex', model: 'm', estimatedTokens: 1, estimatedCostUsd: 0.006 })).toThrow('Model daily');
    expect(() => budget.reserve({ runId: 'r', provider: 'cli-codex', model: 'other', estimatedTokens: 1, estimatedCostUsd: 0.011 })).toThrow('Provider daily');
    budget.beginRun('repo', { maxCostUsd: 0.001 });
    expect(() => budget.reserve({ runId: 'repo', provider: 'cli-codex', model: 'other', estimatedTokens: 1, estimatedCostUsd: 0.002 })).toThrow('Repository run');
    budget.updateConfig({ maxTokensPerRun: 5 });
    const first = budget.reserve({ runId: 'tokens', provider: 'cli-codex', model: 'other', estimatedTokens: 3, estimatedCostUsd: 0 });
    budget.settle(first.reservationId, { tokens: 3, costUsd: 0 });
    expect(() => budget.reserve({ runId: 'tokens', provider: 'cli-codex', model: 'other', estimatedTokens: 3, estimatedCostUsd: 0 })).toThrow('Run tokens');
  });

  it('retains reservations conservatively after restart without counting them twice', () => {
    const file = join(directory, 'restart-budget.json');
    const original = new BudgetManager({}, file);
    original.reserve({ runId: 'r', provider: 'cli-codex', model: 'm', estimatedTokens: 3, estimatedCostUsd: 0.01 });
    expect(new BudgetManager({}, file).getUsage().currentDailyCostUsd).toBe(0.01);
    expect(new BudgetManager({}, file).getUsage().currentDailyCostUsd).toBe(0.01);
  });

  it('rejects invalid values and does not silently reset a corrupt ledger', () => {
    const { budget } = fixture();
    expect(() => budget.updateConfig({ maxTokensPerRun: -1 })).toThrow('non-negative');
    expect(() => budget.recordSpend(NaN)).toThrow('finite');
    writeFileSync(join(directory, 'corrupt.json'), '{');
    expect(() => new BudgetManager({}, join(directory, 'corrupt.json'))).toThrow('Cannot safely load');
  });

  it.each([
    { providerDailyCostUsd: { 'cli-codex': -1 } },
    { modelDailyCostUsd: { m: 'invalid' } },
    { requestAttemptsToday: -1 },
    { runSpend: { r: { costUsd: 0, tokens: -1, startedAt: 1 } } },
    { reservations: { r: { runId: 'r', model: 'm', provider: 'cli-codex', estimatedTokens: 1, estimatedCostUsd: 0 } } },
  ])('rejects malformed nested ledger data: %j', invalid => {
    const { budget } = fixture();
    const file = join(directory, 'invalid-nested.json');
    writeFileSync(file, JSON.stringify({ ...budget.getUsage(), ...invalid }));
    expect(() => new BudgetManager({}, file)).toThrow('Cannot safely load');
  });

  it('does not round 99.5 percent up into an exceeded hard stop', () => {
    const { budget } = fixture();
    budget.updateConfig({ dailyBudgetUsd: 1 });
    budget.recordSpend(0.995);
    expect(budget.getStatus().dailyExceeded).toBe(false);
  });

  it('warn-only mode still records overspend and run counts', () => {
    const { budget } = fixture();
    budget.updateConfig({ hardStop: false, maxCostPerRunUsd: 0.001 });
    const reservation = budget.reserve({ runId: 'r', provider: 'cli-codex', model: 'm', estimatedTokens: 1, estimatedCostUsd: 0.01 });
    expect(reservation.warning).toContain('Run cost');
    budget.settle(reservation.reservationId, { tokens: 1, costUsd: 0.01 });
    expect(budget.getUsage().totalRunsToday).toBe(1);
  });

  it('caps the requested output by the remaining run allowance and accounts once', async () => {
    const { provider, budget, metrics } = fixture();
    budget.updateConfig({ maxTokensPerRun: 20 });
    const execution = openExecution(provider, { model: 'cli-codex/test', messages: [{ role: 'user', content: 'abcd' }], max_tokens: 100 }, { budgetManager: budget, metrics });
    expect(execution.request.max_tokens).toBe(19);
    execution.finish('abcd'); execution.finish('abcd');
    expect(metrics.snapshot()['cli-codex/test'].requests).toBe(1);
    expect(budget.getUsage().totalTokensToday).toBe(2);
    expect(budget.getUsage().currentDailyCostUsd).toBe(estimateCost('cli-codex/test', 1, 1));
  });
});
