import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface GitWorkspaceOptions { worktree?: string; allBranches?: boolean; branch?: string; limit?: number }
export interface GitWorkspaceFile { path: string; previousPath?: string; status: string; staged?: boolean; unstaged?: boolean; untracked?: boolean }
export interface GitWorkspaceBranch { name: string; ref: string; sha: string; current: boolean; remote: boolean }
export interface GitWorkspaceWorktree { id: string; path: string; name: string; branch: string; head: string; detached: boolean; locked: boolean; available: boolean; active: boolean }
export interface GitWorkspaceCommit { sha: string; parents: string[]; author: string; date: string; subject: string; refs: string[]; head: boolean; graph: GitGraphRow }
export interface GitGraphRow { lane: number; width: number; edges: Array<{ from: number; to: number; color: number; kind: 'through' | 'parent' }> }
export interface GitWorkspaceSnapshot {
  detected: boolean; reason?: string; root?: string; name?: string; branch?: string; head?: string;
  worktree?: string; branches: GitWorkspaceBranch[]; worktrees: GitWorkspaceWorktree[]; commits: GitWorkspaceCommit[];
  files: GitWorkspaceFile[]; truncated: boolean; historyLimit: number; updatedAt: string;
}
export interface GitWorkspaceDiff {
  mode: 'history' | 'changes'; commit?: Omit<GitWorkspaceCommit, 'graph'>; files: GitWorkspaceFile[];
  path: string | null; patch: string; additions: number; deletions: number; binary: boolean; truncated: boolean; message?: string;
}
export type GitWorkspaceAction = 'fetch' | 'pull' | 'push' | 'create-branch' | 'add-worktree';

const MAX_OUTPUT = 8 * 1024 * 1024;
const MAX_PATCH = 240 * 1024;
const HEX = /^[a-f0-9]{7,64}$/i;
const within = (root: string, candidate: string) => {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
const idFor = (path: string) => createHash('sha256').update(process.platform === 'win32' ? path.toLowerCase() : path).digest('hex').slice(0, 20);

/** No child stderr is returned: it can include credentials in a configured remote URL. */
export class GitWorkspaceError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); this.name = 'GitWorkspaceError'; }
}

/** Assign lanes from real parent relationships in a topologically ordered log. */
export function buildGitGraph(commits: Array<{ sha: string; parents: string[] }>): GitGraphRow[] {
  let lanes: string[] = [];
  return commits.map(commit => {
    let lane = lanes.indexOf(commit.sha);
    if (lane < 0) { lane = lanes.length; lanes.push(commit.sha); }
    const before = [...lanes];
    const after = lanes.filter(sha => sha !== commit.sha);
    for (let i = 0; i < commit.parents.length; i++) {
      const parent = commit.parents[i];
      if (!after.includes(parent)) after.splice(Math.min(lane + i, after.length), 0, parent);
    }
    const edges: GitGraphRow['edges'] = [];
    before.forEach((sha, index) => {
      if (sha !== commit.sha && after.includes(sha)) edges.push({ from: index, to: after.indexOf(sha), color: index, kind: 'through' });
    });
    commit.parents.forEach((sha, index) => edges.push({ from: lane, to: after.indexOf(sha), color: index ? after.indexOf(sha) : lane, kind: 'parent' }));
    lanes = after;
    return { lane, width: Math.max(1, before.length, after.length), edges };
  });
}

function parseLog(output: string): Array<Omit<GitWorkspaceCommit, 'graph'>> {
  const fields = output.split('\0');
  const rows: Array<Omit<GitWorkspaceCommit, 'graph'>> = [];
  for (let i = 0; i + 4 < fields.length; i += 5) {
    const sha = fields[i].trim();
    if (!HEX.test(sha)) continue;
    rows.push({ sha, parents: fields[i + 1].split(' ').filter(Boolean), author: fields[i + 2], date: fields[i + 3], subject: fields[i + 4], refs: [], head: false });
  }
  return rows;
}

function parseStatus(output: string): GitWorkspaceFile[] {
  const entries = output.split('\0');
  const files: GitWorkspaceFile[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const x = entry[0], y = entry[1];
    const rename = x === 'R' || x === 'C' || y === 'R' || y === 'C';
    files.push({ path: entry.slice(3), ...(rename ? { previousPath: entries[++i] } : {}), status: x === '?' ? 'A' : x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D') ? 'U' : (y !== ' ' ? y : x), staged: x !== ' ' && x !== '?', unstaged: y !== ' ' && y !== '?', untracked: x === '?' });
  }
  return files;
}

function parseNameStatus(output: string): GitWorkspaceFile[] {
  const fields = output.split('\0');
  const files: GitWorkspaceFile[] = [];
  for (let i = 0; i + 1 < fields.length;) {
    const code = fields[i++].trim();
    if (!code) continue;
    const first = fields[i++];
    files.push(code.startsWith('R') || code.startsWith('C') ? { status: code[0], previousPath: first, path: fields[i++] } : { status: code[0], path: first });
  }
  return files;
}

/**
 * Construct only with a server-authorized configured workspace directory.
 * Related worktrees outside that directory are visible as metadata but cannot be opened.
 * The server must authorize every request; mutations additionally require write access.
 */
export class GitWorkspaceService {
  private readonly workspacePath: string;
  private inFlight = new Map<string, Promise<GitWorkspaceSnapshot>>();
  private cache = new Map<string, { at: number; snapshot: GitWorkspaceSnapshot }>();
  private mutating = false;
  private generation = 0;

  constructor(workspacePath: string) {
    if (!isAbsolute(workspacePath)) throw new GitWorkspaceError('Workspace must be an absolute configured directory.');
    this.workspacePath = resolve(workspacePath);
  }

  private git(cwd: string, args: string[], mutation = false): Promise<string> {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_OPTIONAL_LOCKS: mutation ? '1' : '0' };
    for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|CEILING_DIRECTORIES|NAMESPACE|REPLACE_REF_BASE)/.test(key)) delete (env as Record<string, string | undefined>)[key];
    return new Promise((res, rej) => {
      execFile('git', ['--no-pager', '-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false', ...(mutation ? ['-c', 'core.hooksPath=/dev/null', '-c', 'maintenance.auto=false'] : []), ...args], {
        cwd, env, windowsHide: true, encoding: 'utf8', timeout: mutation ? 60_000 : 15_000, maxBuffer: MAX_OUTPUT,
      }, (err, stdout) => {
        if (err) rej(new GitWorkspaceError((err as NodeJS.ErrnoException).code === 'ENOENT' ? 'Git is not available on this host.' : 'Git could not complete the operation. Check repository access, conflicts, and remote authentication.', 422));
        else res(stdout);
      });
    });
  }

  private async context(worktree?: string): Promise<{ root: string; cwd: string; trees: GitWorkspaceWorktree[] } | null> {
    let root: string;
    try { root = await realpath(this.workspacePath); if (!(await stat(root)).isDirectory()) return null; } catch { return null; }
    let cwd: string;
    try {
      if ((await this.git(root, ['rev-parse', '--is-inside-work-tree'])).trim() !== 'true') return null;
      cwd = await realpath((await this.git(root, ['rev-parse', '--show-toplevel'])).trim());
      // A configured subdirectory must not grant access to its parent repository.
      if (!within(root, cwd)) return null;
    } catch (error) {
      if (error instanceof GitWorkspaceError && error.message.includes('not available')) throw error;
      return null;
    }
    const output = await this.git(cwd, ['worktree', 'list', '--porcelain', '-z']);
    const raw: Array<Record<string, string>> = [];
    let record: Record<string, string> = {};
    for (const field of output.split('\0')) {
      if (!field) { if (record.worktree) raw.push(record); record = {}; continue; }
      const space = field.indexOf(' ');
      record[space < 0 ? field : field.slice(0, space)] = space < 0 ? '' : field.slice(space + 1);
    }
    if (record.worktree) raw.push(record);
    const trees = await Promise.all(raw.map(async item => {
      let canonical: string | undefined;
      try { canonical = await realpath(item.worktree); } catch { /* prunable worktree */ }
      return { id: idFor(canonical || item.worktree), path: item.worktree, name: basename(item.worktree), branch: (item.branch || '').replace(/^refs\/heads\//, ''), head: item.HEAD || '', detached: 'detached' in item, locked: 'locked' in item, available: Boolean(canonical && within(root, canonical)), active: canonical === cwd };
    }));
    if (worktree) {
      const selected = trees.find(tree => tree.id === worktree);
      if (!selected?.available) throw new GitWorkspaceError('This worktree is outside the configured workspace or unavailable.', 403);
      const selectedPath = await realpath(selected.path);
      if (!within(root, selectedPath)) throw new GitWorkspaceError('Worktree is outside the configured workspace.', 403);
      cwd = selectedPath;
      trees.forEach(tree => { tree.active = tree.id === worktree; });
    }
    return { root, cwd, trees };
  }

  private async refs(cwd: string): Promise<Array<{ ref: string; name: string; sha: string; current: boolean; remote: boolean }>> {
    const output = await this.git(cwd, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(HEAD)%00%(*objectname)', 'refs/heads', 'refs/remotes', 'refs/tags']);
    return output.split('\n').filter(Boolean).map(line => {
      const [ref, sha, head, peeled] = line.split('\0');
      return { ref, name: ref.replace(/^refs\/(heads|remotes|tags)\//, ''), sha: peeled || sha, current: head === '*', remote: ref.startsWith('refs/remotes/') };
    });
  }

  private async head(cwd: string): Promise<{ branch: string; head: string }> {
    let branch = '', head = '';
    try { branch = (await this.git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim(); } catch { /* detached */ }
    try { head = (await this.git(cwd, ['rev-parse', '--verify', 'HEAD'])).trim(); } catch { /* unborn */ }
    return { branch, head };
  }

  private async status(cwd: string, trees: GitWorkspaceWorktree[]): Promise<GitWorkspaceFile[]> {
    const files = parseStatus(await this.git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
    // Only hide Git's untracked entry for a known nested worktree created by this
    // service. Other files inside the container remain visible, without editing ignores.
    const nested = trees.filter(tree => !tree.active && within(join(cwd, '.conduit-worktrees'), resolve(tree.path)))
      .map(tree => relative(cwd, resolve(tree.path)).replaceAll('\\', '/') + '/');
    return files.filter(file => !(file.untracked && nested.some(prefix => file.path === prefix || file.path.startsWith(prefix))));
  }

  async snapshot(options: GitWorkspaceOptions = {}): Promise<GitWorkspaceSnapshot> {
    const key = JSON.stringify(options);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 1500) return structuredClone(cached.snapshot);
    const running = this.inFlight.get(key);
    if (running) return structuredClone(await running);
    const generation = this.generation;
    const promise = this.readSnapshot(options);
    this.inFlight.set(key, promise);
    try {
      const snapshot = await promise;
      if (this.cache.size > 20) this.cache.clear();
      if (generation === this.generation) this.cache.set(key, { at: Date.now(), snapshot });
      return structuredClone(snapshot);
    } finally { if (this.inFlight.get(key) === promise) this.inFlight.delete(key); }
  }

  private async readSnapshot(options: GitWorkspaceOptions): Promise<GitWorkspaceSnapshot> {
    const ctx = await this.context(options.worktree);
    const limit = Math.max(1, Math.min(300, Number.isFinite(options.limit) ? Math.floor(options.limit!) : 180));
    const base = { detected: false, branches: [], worktrees: [], commits: [], files: [], truncated: false, historyLimit: limit, updatedAt: new Date().toISOString() } satisfies GitWorkspaceSnapshot;
    if (!ctx) return { ...base, reason: 'No Git repository root was detected in the configured workspace.' };
    const [head, refs, files] = await Promise.all([this.head(ctx.cwd), this.refs(ctx.cwd), this.status(ctx.cwd, ctx.trees)]);
    const branches = refs.filter(ref => !ref.ref.startsWith('refs/tags/'));
    const selected = options.branch ? branches.find(ref => ref.ref === options.branch) : undefined;
    if (options.branch && !selected) throw new GitWorkspaceError('Select an existing repository branch.');
    const raw = head.head || refs.length ? parseLog(await this.git(ctx.cwd, ['log', '--topo-order', `--max-count=${limit + 1}`, '--format=%H%x00%P%x00%an%x00%aI%x00%s', '-z', ...(selected ? [selected.ref] : options.allBranches ? ['--all'] : head.head ? ['HEAD'] : ['--all']), '--'])) : [];
    const truncated = raw.length > limit;
    const commits = raw.slice(0, limit);
    const graph = buildGitGraph(commits);
    commits.forEach(commit => { commit.refs = refs.filter(ref => ref.sha === commit.sha).map(ref => ref.name); commit.head = commit.sha === head.head; });
    return { ...base, detected: true, root: ctx.cwd, name: basename(ctx.cwd), branch: head.branch, head: head.head, worktree: ctx.trees.find(tree => tree.active)?.id, branches, worktrees: ctx.trees, files, commits: commits.map((commit, i) => ({ ...commit, graph: graph[i] })), truncated, historyLimit: limit };
  }

  async diff(options: { worktree?: string; commit?: string; path?: string; mode?: 'history' | 'changes' } = {}): Promise<GitWorkspaceDiff> {
    const ctx = await this.context(options.worktree);
    if (!ctx) throw new GitWorkspaceError('No Git repository detected.', 404);
    const mode = options.mode || 'history';
    const result: GitWorkspaceDiff = { mode, files: [], path: null, patch: '', additions: 0, deletions: 0, binary: false, truncated: false };
    let target = '', head = '';
    if (mode === 'history') {
      if (!options.commit || !HEX.test(options.commit)) throw new GitWorkspaceError('Select a valid commit hash.');
      target = (await this.git(ctx.cwd, ['rev-parse', '--verify', `${options.commit}^{commit}`])).trim();
      const metadata = parseLog(await this.git(ctx.cwd, ['log', '-1', '--format=%H%x00%P%x00%an%x00%aI%x00%s', '-z', target, '--']));
      result.commit = metadata[0];
      result.files = parseNameStatus(await this.git(ctx.cwd, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', '-M', ...(metadata[0]?.parents.length ? [metadata[0].parents[0], target] : [target]), '--']));
    } else {
      result.files = await this.status(ctx.cwd, ctx.trees);
      head = (await this.head(ctx.cwd)).head;
    }
    const file = options.path ? result.files.find(file => file.path === options.path) : result.files[0];
    if (options.path && !file) throw new GitWorkspaceError('File is not in the selected changes.', 404);
    if (!file) return { ...result, message: mode === 'history' ? 'This commit has no file changes against its first parent.' : 'The working directory is clean.' };
    result.path = file.path;
    if (file.untracked) {
      const filePath = resolve(ctx.cwd, file.path);
      if (!within(ctx.cwd, filePath)) throw new GitWorkspaceError('File is outside the worktree.', 403);
      const info = await lstat(filePath);
      if (info.isSymbolicLink()) return { ...result, message: 'Untracked symbolic link; target content is not read.' };
      if (!info.isFile()) return { ...result, message: 'This entry is not a regular text file.' };
      const canonical = await realpath(filePath);
      if (!within(ctx.cwd, canonical)) throw new GitWorkspaceError('File resolves outside the worktree.', 403);
      const handle = await open(canonical, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(info.size, MAX_PATCH) + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        result.truncated = info.size > MAX_PATCH;
        result.binary = buffer.subarray(0, bytesRead).includes(0);
        if (!result.binary) {
          const text = buffer.subarray(0, Math.min(bytesRead, MAX_PATCH)).toString('utf8');
          const lines = text.split('\n'); if (lines.at(-1) === '') lines.pop();
          result.patch = `--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => '+' + line).join('\n');
        }
      } finally { await handle.close(); }
    } else {
      const paths = [...new Set([...(file.previousPath ? [file.previousPath] : []), file.path])];
      const args = ['--no-ext-diff', '--no-textconv', '--no-color', '--unified=3', '--find-renames'];
      if (mode === 'history') {
        const parent = result.commit?.parents[0];
        result.patch = parent
          ? await this.git(ctx.cwd, ['--literal-pathspecs', 'diff', ...args, parent, target, '--', ...paths])
          : await this.git(ctx.cwd, ['--literal-pathspecs', 'show', '--format=', ...args, target, '--', ...paths]);
      } else {
        // An unborn branch needs separate index and working-tree comparisons.
        result.patch = head
          ? await this.git(ctx.cwd, ['--literal-pathspecs', 'diff', ...args, head, '--', ...paths])
          : (await this.git(ctx.cwd, ['--literal-pathspecs', 'diff', '--cached', ...args, '--', ...paths])) + (await this.git(ctx.cwd, ['--literal-pathspecs', 'diff', ...args, '--', ...paths]));
      }
      result.truncated = Buffer.byteLength(result.patch) > MAX_PATCH;
      if (result.truncated) result.patch = Buffer.from(result.patch).subarray(0, MAX_PATCH).toString('utf8');
      result.binary = /^Binary files |^GIT binary patch/m.test(result.patch);
    }
    let inHunk = false;
    for (const line of result.patch.split('\n')) {
      if (line.startsWith('diff --git ')) inHunk = false;
      if (line.startsWith('@@ ')) inHunk = true;
      if (inHunk && line.startsWith('+')) result.additions++;
      if (inHunk && line.startsWith('-')) result.deletions++;
    }
    if (!result.patch && !result.message) result.message = result.binary ? 'Binary file changed.' : 'No text diff. This may be a rename, permission change, submodule, or cancelling staged and unstaged edits.';
    return result;
  }

  /** Called only after the host authorizes an explicit user action. Never runs automatically. */
  async action(input: { action: GitWorkspaceAction; worktree?: string; name?: string }): Promise<{ ok: true; message: string }> {
    if (this.mutating) throw new GitWorkspaceError('Another Git operation is running. Try again when it completes.', 409);
    const allowed: GitWorkspaceAction[] = ['fetch', 'pull', 'push', 'create-branch', 'add-worktree'];
    if (!allowed.includes(input.action)) throw new GitWorkspaceError('Unsupported Git action.');
    this.mutating = true;
    try {
      const ctx = await this.context(input.worktree);
      if (!ctx) throw new GitWorkspaceError('No Git repository detected.', 404);
      if (input.action === 'create-branch' || input.action === 'add-worktree') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 120 || name.startsWith('-') || /[\x00-\x20\x7f]/.test(name)) throw new GitWorkspaceError('Enter a valid branch name.');
        await this.git(ctx.cwd, ['check-ref-format', '--branch', name]);
        if (input.action === 'create-branch') await this.git(ctx.cwd, ['branch', '--', name, 'HEAD'], true);
        else {
          // Worktree destinations are derived by this service, never caller-supplied paths.
          const container = join(ctx.root, '.conduit-worktrees');
          try {
            const existing = await lstat(container);
            if (existing.isSymbolicLink() || !existing.isDirectory()) throw new GitWorkspaceError('The worktree directory must be a regular directory inside the configured workspace.');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            await mkdir(container);
          }
          const canonical = await realpath(container);
          if (!within(ctx.root, canonical)) throw new GitWorkspaceError('Worktree destination is outside the configured workspace.', 403);
          const slug = name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80);
          const destination = join(canonical, `${slug}-${idFor(name).slice(0, 8)}`);
          try { await lstat(destination); throw new GitWorkspaceError('A directory already exists for that worktree.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          await this.git(ctx.cwd, ['worktree', 'add', '-b', name, '--', destination, 'HEAD'], true);
        }
      } else {
        const head = await this.head(ctx.cwd);
        if (input.action !== 'fetch' && !head.branch) throw new GitWorkspaceError('Pull and push require an attached branch.');
        if (input.action === 'pull') {
          const files = await this.status(ctx.cwd, ctx.trees);
          if (files.length) throw new GitWorkspaceError('Commit or stash your working changes before pulling.', 409);
        }
        if (input.action === 'push') {
          const tracking = (await this.git(ctx.cwd, ['for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${head.branch}`])).trim().split('\0');
          const remote = tracking[0], remoteRef = tracking[1];
          const remotes = (await this.git(ctx.cwd, ['remote'])).split('\n');
          if (!remote || !remotes.includes(remote) || remote.startsWith('-') || !remoteRef?.startsWith('refs/heads/')) throw new GitWorkspaceError('Configure an upstream remote branch before pushing.');
          // Explicit destination prevents push.default/mirror/followTags configuration
          // from publishing other branches or tags through this current-branch action.
          await this.git(ctx.cwd, ['-c', `remote.${remote}.mirror=false`, 'push', '--no-force', '--no-mirror', '--no-follow-tags', '--recurse-submodules=no', '--', remote, `HEAD:${remoteRef}`], true);
        } else await this.git(ctx.cwd, input.action === 'fetch' ? ['fetch', '--no-recurse-submodules'] : ['pull', '--ff-only', '--no-rebase', '--no-recurse-submodules'], true);
      }
      return { ok: true, message: input.action === 'create-branch' ? 'Branch created. The current checkout is unchanged.' : input.action === 'add-worktree' ? 'Worktree created inside .conduit-worktrees.' : `Git ${input.action} completed.` };
    } finally { ++this.generation; this.cache.clear(); this.inFlight.clear(); this.mutating = false; }
  }
}
