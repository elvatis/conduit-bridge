import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitExecute } from '../../src/skills/split-execute.js';
import { RateLimiter } from '../../src/rate-limiter.js';
import { skillContext } from './addendum-context.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-execute-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('runs independent tasks concurrently and supplies their results only to ready descendants', async () => {
  const context = skillContext(root); const gates: Array<() => void> = []; const inputs: string[] = []; let active = 0; let peak = 0;
  context.executeModel = vi.fn(async req => {
    inputs.push(req.messages[0].content); peak = Math.max(peak, ++active);
    if (inputs.length <= 2) await new Promise<void>(resolve => { gates.push(resolve); if (gates.length === 2) gates.forEach(release => release()); });
    active--; return `answer-${inputs.length}`;
  });
  const tasks = [{ id: 'a', agent: 'cli-codex', prompt: 'first', dependsOn: [] }, { id: 'b', agent: 'cli-codex', prompt: 'second', dependsOn: [] }, { id: 'c', agent: 'cli-codex', prompt: 'combine', dependsOn: ['a', 'b'] }];
  const result = await splitExecute(tasks, context); expect(peak).toBe(2); expect(result.results.map(task => task.status)).toEqual(['completed', 'completed', 'completed']);
  expect(inputs[2]).toContain('Dependency outputs'); expect(inputs[2]).toContain('answer-2'); expect(context.rateLimiter!.summary().calls).toHaveLength(3); expect(context.rateLimiter!.summary().totals['cli-codex']).toBeGreaterThan(0);
});
it('rejects invalid graphs before calls, enforces admission and skips failed descendants', async () => {
  const context = skillContext(root); context.rateLimiter = new RateLimiter(root, { 'cli-codex': { perMinute: 1, perHour: 1, perDay: 1 } });
  await expect(splitExecute([{ id: 'a', agent: 'cli-codex', prompt: 'task', dependsOn: ['a'] }], context)).rejects.toThrow('cycle'); expect(context.executeModel).not.toHaveBeenCalled();
  context.rateLimiter.reserve('cli-codex');
  const result = await splitExecute([{ id: 'a', agent: 'cli-codex', prompt: 'task', dependsOn: [] }, { id: 'b', agent: 'cli-codex', prompt: 'next', dependsOn: ['a'] }], context);
  expect(result.results.map(task => task.status)).toEqual(['failed', 'skipped']); expect(context.executeModel).not.toHaveBeenCalled();
});
it('rechecks execution approval even for direct embedders and does not serialize exception secrets', async () => {
  const context = skillContext(root); context.authorize = () => { throw new Error('denied'); };
  const tasks = [{ id: 'a', agent: 'cli-codex', prompt: 'task', dependsOn: [] }]; await expect(splitExecute(tasks, context)).rejects.toThrow('denied'); expect(context.executeModel).not.toHaveBeenCalled();
  context.authorize = vi.fn(); context.executeModel = async () => { throw new Error('private-provider-body'); };
  expect(JSON.stringify(await splitExecute(tasks, context))).not.toContain('private-provider-body');
});
