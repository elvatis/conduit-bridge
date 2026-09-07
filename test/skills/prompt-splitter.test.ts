import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptSplitter, validateSubTasks } from '../../src/skills/prompt-splitter.js';
import { SkillError } from '../../src/skills/index.js';
import { skillContext } from './addendum-context.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-splitter-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
const plan = [{ id: 't1', agent: 'codex_run', prompt: 'implement the task', dependsOn: [] }];
it('validates all dependencies, cycles, duplicate IDs and unsupported agents', () => {
  expect(validateSubTasks(plan)[0].agent).toBe('cli-codex');
  expect(validateSubTasks([...plan, { id: 'unsupported', agent: 'openclaw_run', prompt: 'skip this', dependsOn: [] }])).toHaveLength(1);
  for (const invalid of [[...plan, ...plan], [{ ...plan[0], dependsOn: ['missing'] }], [{ ...plan[0], dependsOn: ['t1'] }], [{ ...plan[0], agent: 'openclaw_run' }]]) expect(() => validateSubTasks(invalid)).toThrow();
});
it('uses Gemini then local then heuristic, recording cloud analysis admissions', async () => {
  const context = skillContext(root); const called: string[] = [];
  context.executeModel = vi.fn(async req => { called.push(req.model); if (req.model.startsWith('api-')) return 'invalid json'; return JSON.stringify(plan); });
  const result = await new PromptSplitter(context).split('implement a function'); expect(result.strategy).toBe('local'); expect(called).toEqual(['api-gemini/fixture', 'lmstudio/auto']); expect(context.rateLimiter!.summary().calls).toHaveLength(1);
  context.executeModel = vi.fn(async () => 'invalid');
  expect((await new PromptSplitter(context).split('code a function')).strategy).toBe('heuristic');
});
it('keeps private analysis local, fails closed on policy denial and cancels fallback', async () => {
  const context = skillContext(root); context.executeModel = vi.fn(async () => JSON.stringify([{ ...plan[0], agent: 'bitnet' }]));
  await new PromptSplitter(context).split('private classification'); expect(vi.mocked(context.resolveModel!).mock.calls.every(([agent]) => agent === 'lmstudio' || agent === 'bitnet')).toBe(true);
  await expect(new PromptSplitter(context).split('private code', 'gemini')).rejects.toThrow('cannot');
  context.authorize = () => { throw new SkillError('denied', 403); };
  await expect(new PromptSplitter(context).split('code task')).rejects.toThrow('denied');
  await expect(new PromptSplitter({ ...context, signal: AbortSignal.abort() }).split('code task')).rejects.toThrow();
});
it('heuristic preserves long requests and bounded sequential dependencies without model calls', async () => {
  const context = skillContext(root); const result = await new PromptSplitter(context).split('code first\n- research second', 'heuristic');
  expect(result.tasks).toHaveLength(2); expect(result.tasks[1].dependsOn).toEqual(['t1']); expect(context.executeModel).not.toHaveBeenCalled();
  const prompt = 'x'.repeat(16000); expect((await new PromptSplitter(context).split(prompt, 'heuristic')).tasks[0].prompt).toBe(prompt);
});
