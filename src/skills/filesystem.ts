import { constants, lstatSync, realpathSync, statSync, type Stats } from 'node:fs';
import { open, readdir, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isPathWithin } from '../workspaces.js';
import { SkillError, type SkillDefinition, type SkillExecutionContext } from './index.js';
import { CodeSearch, type CodeSearchOptions, type SearchResult } from './code-search.js';

/** Search the authorized workspace using indexed code search or its ripgrep fallback. */
export async function searchInWorkspace(pattern: string, context: SkillExecutionContext, options?: CodeSearchOptions): Promise<SearchResult[]> { return new CodeSearch(context).search(pattern, options); }

const BLOCKED = new Set(['.git', '.ssh', '.conduit', '.codex', '.agents']);

function sameIdentity(left: Pick<Stats, 'dev' | 'ino'>, right: Pick<Stats, 'dev' | 'ino'>): boolean {
  return left.ino !== 0 && left.dev === right.dev && left.ino === right.ino;
}

async function verifyFileHandle(context: SkillExecutionContext, inputPath: string, target: string, file: FileHandle): Promise<Stats> {
  const opened = await file.stat();
  if (!opened.isFile() || opened.nlink !== 1) throw new SkillError('Tool access requires a regular file with one filesystem link', 403);
  const checked = resolveSkillPath(context, inputPath);
  const current = statSync(checked);
  if (checked !== target || !sameIdentity(opened, current)) throw new SkillError('Workspace path changed while the file was being opened', 409);
  return opened;
}

/** Resolve a relative tool path within the selected root; reject links and control files. */
export function resolveSkillPath(context: SkillExecutionContext, value: unknown, allowMissing = false): string {
  if (!context.workspace) throw new SkillError('Select a registered workspace for filesystem tools', 400);
  if (typeof value !== 'string' || value.length > 4096 || /[\0\r\n:]/.test(value) || isAbsolute(value)) throw new SkillError('Use a relative workspace path', 400);
  const rootEntry = lstatSync(context.workspace.root);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) throw new SkillError('The registered workspace root must be a real directory', 403);
  const root = realpathSync.native(context.workspace.root);
  if (!sameIdentity(rootEntry, statSync(root))) throw new SkillError('Workspace root changed during path resolution', 409);
  const target = resolve(root, value || '.');
  if (!isPathWithin(root, target)) throw new SkillError('Path is outside the selected workspace', 403);
  const parts = relative(root, target).split(sep).filter(Boolean);
  let cursor = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (BLOCKED.has(part.toLowerCase()) || /^\.env(?:\.|$)/i.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) throw new SkillError('Tool access to this control or credential path is not allowed', 403);
    cursor = join(cursor, part);
    try {
      const entry = lstatSync(cursor);
      if (entry.isSymbolicLink() || !isPathWithin(root, realpathSync.native(cursor))) throw new SkillError('Symbolic links and junctions are not allowed in tool paths', 403);
    } catch (error) {
      if (allowMissing && i === parts.length - 1 && (error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

/** Read, write, or list bounded files under an authorized workspace. */
export const filesystemSkill: SkillDefinition = {
  name: 'filesystem',
  description: 'Read, write or list workspace files. Refuses links, control directories and credential files.',
  effect: input => input.action === 'write' ? 'write' : 'read',
  schema: { type: 'object', additionalProperties: false, required: ['action', 'path'], properties: {
    action: { type: 'string', enum: ['read', 'write', 'list', 'search'] }, path: { type: 'string', maxLength: 4096 },
    pattern: { type: 'string', maxLength: 2000 }, maxResults: { type: 'integer', minimum: 1, maximum: 200 },
    content: { type: 'string', maxLength: 65536 }, overwrite: { type: 'boolean' },
  } },
  async execute(input, context) {
    context.signal.throwIfAborted();
    if (input.action === 'search') return searchInWorkspace(input.pattern as string, context, { cwd: input.path as string, maxResults: input.maxResults as number | undefined });
    if (typeof input.path !== 'string') throw new SkillError('Use a relative workspace path');
    const inputPath = input.path;
    const target = resolveSkillPath(context, inputPath, input.action === 'write');
    if (input.action === 'list') {
      const before = statSync(target);
      if (!before.isDirectory()) throw new SkillError('Path must be a directory');
      const entries = await readdir(target, { withFileTypes: true });
      resolveSkillPath(context, inputPath);
      if (!sameIdentity(before, statSync(target))) throw new SkillError('Workspace directory changed while it was being listed', 409);
      context.signal.throwIfAborted();
      return { path: inputPath, entries: entries.filter(entry => !BLOCKED.has(entry.name.toLowerCase()) && !/^\.env(?:\.|$)/i.test(entry.name)).slice(0, 500).map(entry => ({ name: entry.name, type: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' })), truncated: entries.length > 500 };
    }
    if (input.action === 'read') {
      const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const info = await verifyFileHandle(context, inputPath, target, file);
        if (info.size > 65536) throw new SkillError('Read requires a regular file of at most 64 KiB');
        const bytes = Buffer.alloc(65537);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 65536) throw new SkillError('File grew beyond the 64 KiB read limit');
        context.signal.throwIfAborted();
        return { path: inputPath, content: bytes.subarray(0, bytesRead).toString('utf8'), sizeBytes: bytesRead };
      } finally { await file.close(); }
    }
    if (input.action !== 'write' || typeof input.content !== 'string' || Buffer.byteLength(input.content) > 65536) throw new SkillError('Write requires UTF-8 content of at most 64 KiB');
    const parent = dirname(target);
    if (!statSync(parent).isDirectory()) throw new SkillError('Parent directory must already exist');
    let file: FileHandle;
    if (input.overwrite !== true) file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    else {
      try { file = await open(target, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      }
    }
    try {
      await verifyFileHandle(context, inputPath, target, file);
      context.signal.throwIfAborted();
      if (input.overwrite === true) await file.truncate(0);
      await file.writeFile(input.content); await file.sync();
    } finally { await file.close(); }
    return { path: inputPath, writtenBytes: Buffer.byteLength(input.content) };
  },
};
