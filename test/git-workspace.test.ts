import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildGitGraph, GitWorkspaceService } from '../src/git-workspace.js';
import { GIT_WORKSPACE_HTML, GIT_WORKSPACE_SCRIPT } from '../src/ui/git-workspace.js';

const roots: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(initial = true) {
  const container = await mkdtemp(join(tmpdir(), 'conduit-git-view-test-'));
  roots.push(container);
  const root = join(container, 'repository with spaces');
  await mkdir(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture Author');
  git(root, 'config', 'user.email', 'fixture@example.test');
  if (initial) { await writeFile(join(root, 'app.ts'), 'export const count = 1;\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Initial commit'); }
  return { root, container, service: new GitWorkspaceService(root) };
}
afterAll(async () => {
  for (const root of roots) {
    // Only remove the exact temporary fixture roots created by this suite.
    const rel = relative(tmpdir(), root);
    if (!rel.startsWith('conduit-git-view-test-') || rel.includes(sep)) throw new Error('Unexpected fixture cleanup path');
    await rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
});

describe('Git workspace reads against real repositories', () => {
  it('detects an unborn repository and shows staged changes before its first commit', async () => {
    const { root, service } = await fixture(false);
    expect(await service.snapshot()).toMatchObject({ detected: true, branch: 'main', commits: [], files: [] });
    await writeFile(join(root, 'first file.ts'), 'const first = true;\n');
    git(root, 'add', '.');
    const diff = await service.diff({ mode: 'changes' });
    expect(diff).toMatchObject({ path: 'first file.ts', additions: 1, deletions: 0 });
    expect(diff.patch).toContain('+const first = true;');
  });

  it('uses topology, full metadata, ref badges and the first parent for a merge', async () => {
    const { root, service } = await fixture();
    git(root, 'checkout', '-b', 'codex/feature');
    await writeFile(join(root, 'feature.ts'), 'export const feature = true;\n');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'Add feature');
    git(root, 'checkout', 'main');
    await writeFile(join(root, 'main.ts'), 'export const main = true;\n');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'Main change');
    git(root, 'merge', '--no-ff', 'codex/feature', '-m', 'Merge feature');
    git(root, 'tag', '-a', 'v1.0', '-m', 'Release');
    const snapshot = await service.snapshot({ allBranches: true });
    expect(snapshot.commits).toHaveLength(4);
    expect(snapshot.commits[0]).toMatchObject({ subject: 'Merge feature', author: 'Fixture Author', head: true, refs: expect.arrayContaining(['main', 'v1.0']) });
    expect(snapshot.commits[0].parents).toHaveLength(2);
    expect(snapshot.commits[0].graph.edges.filter(edge => edge.kind === 'parent')).toHaveLength(2);
    expect(snapshot.commits.some(commit => commit.graph.width > 1)).toBe(true);
    const diff = await service.diff({ commit: snapshot.commits[0].sha });
    expect(diff.files).toEqual([{ status: 'A', path: 'feature.ts' }]);
    expect(diff.patch).toContain('+export const feature = true;');
    expect(await service.snapshot({ limit: 2 })).toMatchObject({ truncated: true, historyLimit: 2, commits: expect.any(Array) });
    expect((await service.snapshot({ branch: 'refs/heads/codex/feature' })).commits[0].subject).toBe('Add feature');
  });

  it('reads initial, renamed, modified and untracked paths literally with line counts', async () => {
    const { root, service } = await fixture();
    const initial = git(root, 'rev-parse', 'HEAD');
    expect(await service.diff({ commit: initial })).toMatchObject({ additions: 1, files: [{ status: 'A', path: 'app.ts' }] });
    git(root, 'mv', 'app.ts', 'source [1].ts');
    git(root, 'commit', '-m', 'Rename file');
    const renamed = await service.diff({ commit: git(root, 'rev-parse', 'HEAD') });
    expect(renamed.files).toEqual([{ status: 'R', previousPath: 'app.ts', path: 'source [1].ts' }]);
    expect(renamed.patch).toContain('rename to source [1].ts');
    await writeFile(join(root, 'source [1].ts'), 'export const count = 2;\n');
    await writeFile(join(root, 'untracked file.ts'), 'const secret = "visible fixture";\n');
    const modified = await service.diff({ mode: 'changes', path: 'source [1].ts' });
    expect(modified).toMatchObject({ additions: 1, deletions: 1 });
    expect(modified.patch).toContain('+export const count = 2;');
    const untracked = await service.diff({ mode: 'changes', path: 'untracked file.ts' });
    expect(untracked).toMatchObject({ additions: 1, deletions: 0, binary: false });
    expect(untracked.files.find(file => file.path === 'untracked file.ts')?.untracked).toBe(true);
    await expect(service.diff({ mode: 'changes', path: '../../private' })).rejects.toThrow('not in');
    await expect(service.diff({ commit: '--all' })).rejects.toThrow('hash');
    await expect(service.snapshot({ branch: '--all' })).rejects.toThrow('existing');
  });

  it('limits untracked text and identifies binary data without attempting syntax output', async () => {
    const { root, service } = await fixture();
    await writeFile(join(root, 'large.txt'), 'line\n'.repeat(60_000));
    await writeFile(join(root, 'binary.dat'), Buffer.from([1, 0, 2, 3]));
    expect(await service.diff({ mode: 'changes', path: 'large.txt' })).toMatchObject({ truncated: true, binary: false });
    expect(await service.diff({ mode: 'changes', path: 'binary.dat' })).toMatchObject({ binary: true, patch: '' });
  });

  it('detects .git reference files and detached HEAD while denying sibling worktree traversal', async () => {
    const { root, container, service } = await fixture();
    const sibling = join(container, 'sibling worktree');
    git(root, 'worktree', 'add', '--detach', sibling, 'HEAD');
    expect((await readFile(join(sibling, '.git'), 'utf8')).startsWith('gitdir: ')).toBe(true);
    const rootSnapshot = await service.snapshot();
    const outside = rootSnapshot.worktrees.find(tree => tree.name === 'sibling worktree')!;
    expect(outside).toMatchObject({ available: false, detached: true });
    await expect(service.snapshot({ worktree: outside.id })).rejects.toMatchObject({ statusCode: 403 });
    const linked = await new GitWorkspaceService(sibling).snapshot();
    expect(linked).toMatchObject({ detected: true, branch: '', head: expect.any(String) });
    expect(linked.commits[0].subject).toBe('Initial commit');
    await expect(new GitWorkspaceService(sibling).action({ action: 'push' })).rejects.toThrow('attached');
  });

  it('does not grant parent repository access from a configured subdirectory', async () => {
    const { root, container } = await fixture();
    const child = join(root, 'subdir'); await mkdir(child);
    expect(await new GitWorkspaceService(child).snapshot()).toMatchObject({ detected: false });
    expect(await new GitWorkspaceService(container).snapshot()).toMatchObject({ detected: false });
  });

  it('rejects an untracked junction or symlink that resolves outside the configured root', async () => {
    const { root, container, service } = await fixture();
    const external = join(container, 'outside'); await mkdir(external); await writeFile(join(external, 'private.txt'), 'must not be returned');
    await symlink(external, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const snapshot = await service.snapshot();
    const link = snapshot.files.find(file => file.path.startsWith('link'));
    expect(link).toBeDefined();
    try {
      const diff = await service.diff({ mode: 'changes', path: link!.path });
      expect(diff.patch).not.toContain('must not be returned');
      expect(diff.message).toMatch(/symbolic link|regular text/);
    } catch (error) { expect(error).toMatchObject({ statusCode: 403 }); }
  });
});

describe('explicit Git workspace actions in isolated fixtures', () => {
  it('creates a branch and a constrained linked worktree without changing the active branch', async () => {
    const { root, service } = await fixture();
    await service.action({ action: 'create-branch', name: 'codex/new-branch' });
    expect(git(root, 'branch', '--show-current')).toBe('main');
    expect(git(root, 'show-ref', '--verify', 'refs/heads/codex/new-branch')).toContain('refs/heads/codex/new-branch');
    await service.action({ action: 'add-worktree', name: 'codex/new-worktree' });
    const snapshot = await service.snapshot();
    const linked = snapshot.worktrees.find(tree => tree.branch === 'codex/new-worktree')!;
    expect(linked.available).toBe(true);
    expect(snapshot.files.some(file => file.path.startsWith('.conduit-worktrees/'))).toBe(false);
    expect(dirname(linked.path)).toBe(join(root, '.conduit-worktrees').replaceAll('\\', '/'));
    expect((await service.snapshot({ worktree: linked.id })).branch).toBe('codex/new-worktree');
    await expect(service.action({ action: 'add-worktree', name: '../escape' })).rejects.toThrow();
    await expect(service.action({ action: 'create-branch', name: '--force' })).rejects.toThrow('valid branch');
    expect(git(root, 'branch', '--show-current')).toBe('main');
  });

  it('fetches, fast-forwards, and pushes only the current upstream branch against a local fixture remote', async () => {
    const { root, container, service } = await fixture();
    const remote = join(container, 'fixture-remote.git');
    git(root, 'init', '--bare', remote); git(root, 'remote', 'add', 'origin', remote); git(root, 'push', '-u', 'origin', 'main');
    await writeFile(join(root, 'app.ts'), 'export const count = 2;\n'); git(root, 'commit', '-am', 'Local update');
    git(root, 'tag', '-a', 'do-not-push-tag', '-m', 'Local tag'); git(root, 'branch', 'do-not-push-branch');
    git(root, 'config', 'push.followTags', 'true'); git(root, 'config', 'remote.origin.mirror', 'true');
    await service.action({ action: 'push' });
    expect(git(remote, 'rev-parse', 'main')).toBe(git(root, 'rev-parse', 'main'));
    expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe('refs/heads/main');
    git(root, 'config', 'remote.origin.mirror', 'false');
    const peer = join(container, 'fixture-peer'); git(root, 'clone', '--branch', 'main', remote, peer);
    git(peer, 'config', 'user.name', 'Peer'); git(peer, 'config', 'user.email', 'peer@example.test');
    await writeFile(join(peer, 'peer.ts'), 'export const peer = true;\n'); git(peer, 'add', '.'); git(peer, 'commit', '-m', 'Peer update'); git(peer, 'push');
    await service.action({ action: 'fetch' }); await service.action({ action: 'pull' });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(git(peer, 'rev-parse', 'HEAD'));
    await writeFile(join(peer, 'peer.ts'), 'export const peer = false;\n'); git(peer, 'commit', '-am', 'Remote divergence'); git(peer, 'push');
    await writeFile(join(root, 'local.ts'), 'export const local = true;\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Local divergence');
    await expect(service.action({ action: 'push' })).rejects.toThrow('could not complete');
    await expect(service.action({ action: 'pull' })).rejects.toThrow('could not complete');
    expect(git(root, 'log', '-1', '--format=%s')).toBe('Local divergence');
  }, 20_000);

  it('denies a symlinked destination container and refuses pull with uncommitted changes', async () => {
    const { root, container, service } = await fixture();
    const external = join(container, 'external'); await mkdir(external);
    await symlink(external, join(root, '.conduit-worktrees'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(service.action({ action: 'add-worktree', name: 'codex/blocked' })).rejects.toThrow('regular directory');
    await writeFile(join(root, 'app.ts'), 'dirty\n');
    await expect(service.action({ action: 'pull' })).rejects.toThrow('working changes');
  });
});

describe('Git graph and embedded UI', () => {
  it('joins shared ancestors rather than duplicating their lane', () => {
    const graph = buildGitGraph([{ sha: 'merge', parents: ['a', 'b'] }, { sha: 'a', parents: ['root'] }, { sha: 'b', parents: ['root'] }, { sha: 'root', parents: [] }]);
    expect(graph[0]).toMatchObject({ lane: 0, width: 2 });
    expect(graph[2].edges.filter(edge => edge.kind === 'parent')).toEqual([{ from: 1, to: 0, color: 1, kind: 'parent' }]);
    expect(graph[3]).toMatchObject({ width: 1, edges: [] });
  });
  it('embeds syntactically valid isolated JavaScript and accessible panels', () => {
    expect(() => new Function(GIT_WORKSPACE_SCRIPT)).not.toThrow();
    expect(GIT_WORKSPACE_HTML).toContain('aria-label="Unified diff"');
    expect(GIT_WORKSPACE_SCRIPT).toContain("new CustomEvent('git-workspace-detected'");
    expect(GIT_WORKSPACE_SCRIPT).not.toMatch(/switchTab\(/);
  });
});
