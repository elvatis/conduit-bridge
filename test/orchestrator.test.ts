import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { orchestrate } from '../src/orchestrator.js';
import { skillContext } from './skills/addendum-context.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-orchestrator-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('returns a preview by default and executes only when explicitly requested', async () => {
  const context = skillContext(root);
  expect(await orchestrate('implement the example', { context, strategy: 'heuristic' })).toMatchObject({ strategy: 'heuristic', tasks: [{ id: 't1', agent: 'cli-codex' }] }); expect(context.executeModel).not.toHaveBeenCalled();
  expect(await orchestrate('implement the example', { context, strategy: 'heuristic', execute: true })).toMatchObject({ execution: { results: [{ status: 'completed', output: 'result' }] } });
});
