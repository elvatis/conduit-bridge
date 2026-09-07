import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { filesystemSkill } from '../../src/skills/filesystem.js';
import { SkillRegistry, type SkillExecutionContext } from '../../src/skills/index.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';

let directory: string; let context: SkillExecutionContext;
const registry = new SkillRegistry([filesystemSkill]);
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'conduit-filesystem-')); mkdirSync(join(directory, 'workspace')); mkdirSync(join(directory, 'outside'));
  context = { operator: { operatorId: 'test', role: 'admin', workspaceIds: ['*'], source: 'operator-token', displayName: 'Test' }, workspace: { id: 'ws', root: join(directory, 'workspace') }, signal: new AbortController().signal, store: new TransactionalStateStore(new MemorySnapshotBackend()), authorize: vi.fn() };
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
describe('workspace filesystem tool', () => {
  it('writes, reads and lists actual files; refuses implicit overwrite', async () => {
    await registry.execute('filesystem', { action: 'write', path: 'hello.txt', content: 'hello' }, context);
    expect(await registry.execute('filesystem', { action: 'read', path: 'hello.txt' }, context)).toMatchObject({ content: 'hello', sizeBytes: 5 });
    await expect(registry.execute('filesystem', { action: 'write', path: 'hello.txt', content: 'overwrite' }, context)).rejects.toThrow();
    expect(readFileSync(join(context.workspace!.root, 'hello.txt'), 'utf8')).toBe('hello');
    await registry.execute('filesystem', { action: 'write', path: 'hello.txt', content: 'changed', overwrite: true }, context);
    expect(readFileSync(join(context.workspace!.root, 'hello.txt'), 'utf8')).toBe('changed');
    expect(await registry.execute('filesystem', { action: 'list', path: '.' }, context)).toMatchObject({ entries: [{ name: 'hello.txt', type: 'file' }] });
  });
  it('blocks traversal, absolute paths, linked parents, protected paths and oversized reads', async () => {
    writeFileSync(join(directory, 'outside', 'private.txt'), 'outside');
    symlinkSync(join(directory, 'outside'), join(context.workspace!.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const path of ['../outside/private.txt', join(directory, 'outside', 'private.txt'), 'linked/private.txt', '.env', '.git/config']) await expect(registry.execute('filesystem', { action: 'read', path }, context)).rejects.toThrow();
    await expect(registry.execute('filesystem', { action: 'write', path: 'linked/created.txt', content: 'bad' }, context)).rejects.toThrow();
    writeFileSync(join(context.workspace!.root, 'large'), 'x'.repeat(65537));
    await expect(registry.execute('filesystem', { action: 'read', path: 'large' }, context)).rejects.toThrow('64 KiB');
  });
  it('rejects hard-linked files and a linked workspace root', async () => {
    const outside = join(directory, 'outside', 'private.txt'); writeFileSync(outside, 'outside');
    linkSync(outside, join(context.workspace!.root, 'hardlink.txt'));
    await expect(registry.execute('filesystem', { action: 'read', path: 'hardlink.txt' }, context)).rejects.toThrow('one filesystem link');
    await expect(registry.execute('filesystem', { action: 'write', path: 'hardlink.txt', content: 'changed', overwrite: true }, context)).rejects.toThrow('one filesystem link');
    const linkedRoot = join(directory, 'linked-root'); symlinkSync(join(directory, 'outside'), linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(registry.execute('filesystem', { action: 'read', path: 'private.txt' }, { ...context, workspace: { id: 'ws', root: linkedRoot } })).rejects.toThrow('real directory');
    expect(readFileSync(outside, 'utf8')).toBe('outside');
  });
});
