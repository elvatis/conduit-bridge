import { describe, expect, it } from 'vitest';
import { codexExecutionEvents, recordExecutionEvent } from '../src/execution-events.js';
import { executionSnapshot } from '../src/ui/execution-model.js';
import type { ExecutionEvent } from '../src/types.js';
import { runPipeline, summarizePipelineRun, type PipelineRun } from '../src/pipelines.js';
import type { ProviderRegistry } from '../src/registry.js';
import type { ChatRequest } from '../src/types.js';

describe('structured execution evidence', () => {
  it('publishes pipeline command evidence but removes it from durable pipeline summaries', async () => {
    const updates: PipelineRun[] = [];
    const provider = { name:'cli-codex', ensureConnected:async () => true, chat:async (request: ChatRequest) => { request.onExecutionEvent!({kind:'command',id:'cmd',command:'npm test',status:'completed',startedAt:1,completedAt:2,exitCode:0,combinedOutput:'Pass'}); return 'Verified'; } };
    const registry = {providerForModel:() => provider} as unknown as ProviderRegistry;
    const run = await runPipeline({id:'test',name:'Test',description:'Test evidence',steps:[{id:'s',name:'Verify',model:'cli-codex/test'}]},'Verify the source',registry,{onRunUpdate:update => updates.push(update)});
    expect(run.status).toBe('completed');
    expect(run.stepResults.s.events?.[0]).toMatchObject({command:'npm test',exitCode:0});
    expect(updates.some(update => update.stepResults.s.status === 'running' && update.stepResults.s.events?.length === 1)).toBe(true);
    expect(summarizePipelineRun(run).stepResults.s).not.toHaveProperty('events');
  });
  it('reassembles split JSONL and retains commands, public narration and plans', () => {
    const events: ExecutionEvent[] = [];
    let now = 1000;
    const reader = codexExecutionEvents(event => events.push(event), '/work', () => now++);
    const frames = [
      { type: 'item.started', item: { id: 'cmd', type: 'command_execution', command: 'npm test', status: 'in_progress', aggregated_output: '' } },
      { type: 'item.completed', item: { id: 'private', type: 'reasoning', text: 'This must not be retained.' } },
      { type: 'item.completed', item: { id: 'message', type: 'agent_message', text: 'The first check is complete.' } },
      { type: 'item.updated', item: { id: 'plan', type: 'todo_list', items: [{ text: 'Run tests', completed: false }, { text: 42 }] } },
      { type: 'item.completed', item: { id: 'cmd', type: 'command_execution', command: 'npm test', status: 'failed', aggregated_output: 'Assertion failed', exit_code: 1 } },
    ].map(frame => JSON.stringify(frame)).join('\n');
    for (let offset = 0; offset < frames.length; offset += 17) reader.push(frames.slice(offset, offset + 17));
    reader.finish();
    expect(events.map(event => event.kind)).toEqual(['command', 'message', 'plan', 'command']);
    expect(events[3]).toMatchObject({ id: 'cmd', command: 'npm test', startedAt: 1000, completedAt: 1004, status: 'failed', combinedOutput: 'Assertion failed', exitCode: 1, cwd: '/work' });
    expect(events[2]).toMatchObject({ items: [{ text: 'Run tests', completed: false }] });
    expect(JSON.stringify(events)).not.toContain('must not be retained');
    expect(events[3]).not.toHaveProperty('stderr');
  });

  it('recovers after oversized and malformed frames without retaining unbounded data', () => {
    const events: ExecutionEvent[] = [];
    const reader = codexExecutionEvents(event => events.push(event));
    reader.push('x'.repeat(1_000_001));
    reader.push('discarded\nnot json\n' + JSON.stringify({ type: 'item.completed', item: { id: 'ok', type: 'agent_message', text: 'Recovered' } }));
    reader.finish();
    expect(events).toEqual([expect.objectContaining({ text: 'Recovered' })]);
  });

  it('redacts and bounds evidence while still completing an existing event at the cap', () => {
    const events: ExecutionEvent[] = [];
    const first: ExecutionEvent = { kind: 'command', id: 'cmd', command: 'npm test', status: 'running', startedAt: 1 };
    expect(recordExecutionEvent(events, first, true)).toBe(true);
    expect(recordExecutionEvent(events, { kind: 'message', id: 'another', text: 'Ignored', at: 2 }, false)).toBe(false);
    expect(recordExecutionEvent(events, { ...first, status: 'completed', completedAt: 3, exitCode: 0, combinedOutput: 'Authorization: Bearer unit-test-secret-token-123456\n' + 'x'.repeat(20000) }, false)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(JSON.stringify(events)).not.toContain('unit-test-secret-token');
    expect(JSON.stringify(events)).toContain('[truncated]');
    expect(recordExecutionEvent(events, { ...first, command: 'x'.repeat(32769) }, true)).toBe(false);
  });
});

describe('execution view model', () => {
  it('follows dependencies and normalizes unfinished branches after cancellation', () => {
    const run = { id: 'r', pipelineName: 'Workflow', initialPrompt: 'Work', status: 'cancelled', startedAt: 1000, completedAt: 5000,
      definition: { steps: [{ id: 'a' }, { id: 'b', dependsOn: ['a'] }, { id: 'c', dependsOn: ['b'] }] },
      stepResults: {
        a: { stepId: 'a', stepName: 'Plan', status: 'completed', startedAt: 1000 },
        b: { stepId: 'b', stepName: 'Implement', status: 'running', startedAt: 2000 },
        c: { stepId: 'c', stepName: 'Verify', status: 'pending' },
      },
    } as unknown as PipelineRun;
    const snapshot = executionSnapshot(run, 'pipeline', 100000);
    expect(snapshot.nodes.map(node => [node.depth, node.status])).toEqual([[0, 'completed'], [1, 'cancelled'], [2, 'skipped']]);
    expect(snapshot.elapsedMs).toBe(4000);
    expect(snapshot.counts).toEqual({ running: 0, done: 1, failed: 1, pending: 1 });
    expect(snapshot.actions).toBe(2);
  });

  it('handles persisted summaries and malformed dependency cycles without invented output', () => {
    const run = { id: 'r', status: 'interrupted', startedAt: 2, contentRetained: false, definition: { steps: [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }] }, stepResults: { a: { stepId: 'a', status: 'pending' }, b: { stepId: 'b', status: 'pending' } } } as unknown as PipelineRun;
    const snapshot = executionSnapshot(run, 'pipeline');
    expect(snapshot.contentRetained).toBe(false);
    expect(snapshot.nodes.every(node => node.depth <= 2 && !node.content && node.commands.length === 0)).toBe(true);
  });
});
