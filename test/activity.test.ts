import { describe, expect, it } from 'vitest';
import { ActivityLog } from '../src/activity.js';

describe('structured activity journal', () => {
  it('keeps correlation metadata through live delivery and history', () => {
    const log = new ActivityLog();
    const delivered: unknown[] = [];
    log.subscribe(event => delivered.push(event));
    const context = { traceId: 'trace-1', runId: 'run-2', stepId: 'review', model: 'cli-codex/test', attempt: 2, durationMs: 13 };
    const event = log.add('success', 'pipeline', 'Step completed', context);
    context.traceId = 'mutated';
    expect(event).toMatchObject({ traceId: 'trace-1', runId: 'run-2', stepId: 'review', attempt: 2, durationMs: 13 });
    expect(delivered).toEqual([event]);
    expect(log.snapshot()).toEqual([event]);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('does not retain arbitrary prompt metadata or invalid numeric values', () => {
    const log = new ActivityLog();
    const event = log.add('warning', 'router', 'Retry scheduled', {
      traceId: 'trace-1', attempt: NaN, durationMs: -1, prompt: 'not operational metadata',
    } as Parameters<ActivityLog['add']>[3]);
    expect(event).not.toHaveProperty('prompt');
    expect(event).not.toHaveProperty('attempt');
    expect(event).not.toHaveProperty('durationMs');
  });

  it('isolates failed subscribers and retains only the newest 200 events', () => {
    const log = new ActivityLog();
    let received = 0;
    log.subscribe(() => { throw new Error('observer closed'); });
    const unsubscribe = log.subscribe(() => { received++; });
    for (let i = 0; i < 205; i++) log.add('info', 'test', `Event ${i}`);
    expect(received).toBe(205);
    expect(log.snapshot(200)).toHaveLength(200);
    expect(log.snapshot(200).at(-1)?.message).toBe('Event 5');
    unsubscribe();
    log.add('info', 'test', 'Final event');
    expect(received).toBe(205);
  });
});
