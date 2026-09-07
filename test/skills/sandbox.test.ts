import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commandEnvironment, sandboxSkill } from '../../src/skills/sandbox.js';
import { SkillRegistry, type SkillExecutionContext } from '../../src/skills/index.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';

let root: string; let context: SkillExecutionContext;
const registry = new SkillRegistry([sandboxSkill]);
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-command-')); context = { operator: { operatorId: 'admin', role: 'admin', workspaceIds: ['*'], source: 'operator-token', displayName: 'Test' }, workspace: { id: 'ws', root }, signal: new AbortController().signal, store: new TransactionalStateStore(new MemorySnapshotBackend()), authorize: () => {} }; });
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('bounded process tool', () => {
  it('omits credentials and does not claim OS confinement', async () => {
    expect(commandEnvironment({ PATH: 'safe', GITHUB_TOKEN: 'private', OPENAI_API_KEY: 'private', NODE_OPTIONS: 'unsafe', HOME: 'private' })).toEqual({ PATH: 'safe', NO_COLOR: '1' });
    const result = await registry.execute('sandbox', { executable: 'node', args: ['-e', 'console.log(process.cwd())'] }, context);
    expect(result).toMatchObject({ exitCode: 0, stdout: realpathSync.native(root) + '\n', filesystemConfined: false });
  });
  it('kills timed out and excessive-output processes and rejects escaped cwd', async () => {
    expect(await registry.execute('sandbox', { executable: 'node', args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 }, context)).toMatchObject({ stopReason: 'timeout' });
    expect(await registry.execute('sandbox', { executable: 'node', args: ['-e', 'process.stdout.write("x".repeat(1000000));setInterval(()=>{},1000)'] }, context)).toMatchObject({ stopReason: 'output_limit' });
    await expect(registry.execute('sandbox', { executable: 'node', cwd: '../' }, context)).rejects.toThrow('outside');
  });
});
