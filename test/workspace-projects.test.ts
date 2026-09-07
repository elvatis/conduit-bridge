import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceManager } from '../src/workspaces.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-workspace-project-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('workspace GitHub project association', () => {
  it('persists associations without changing roots and preserves links when renaming', () => {
    const file = join(root, 'workspaces.json'); const manager = new WorkspaceManager(file);
    const entry = manager.addOrUpdateWorkspace(root, 'Fixture').entry!;
    const githubProject = { projectId: 'PVT_fixture', projectUrl: 'https://github.com/orgs/example/projects/1', org: 'example', repo: 'example/repository' };
    expect(manager.setGitHubProject(entry.id, githubProject)).toMatchObject({ path: entry.path, githubProject });
    manager.addOrUpdateWorkspace(root, 'Renamed');
    expect(new WorkspaceManager(file).listWorkspaces().find(item => item.id === entry.id)?.githubProject).toEqual(githubProject);
    manager.setGitHubProject(entry.id, null); expect(manager.listWorkspaces().find(item => item.id === entry.id)?.githubProject).toBeUndefined();
  });
  it('rejects mismatched owners, non-GitHub URLs and nonexistent workspaces', () => {
    const manager = new WorkspaceManager(join(root, 'workspaces.json')); const entry = manager.addOrUpdateWorkspace(root).entry!;
    const link = { projectId: 'PVT_fixture', projectUrl: 'https://github.com/orgs/example/projects/1', org: 'example' };
    expect(() => manager.setGitHubProject('missing', link)).toThrow('not found');
    expect(() => manager.setGitHubProject(entry.id, { ...link, org: 'another' })).toThrow('owner');
    expect(() => manager.setGitHubProject(entry.id, { ...link, projectUrl: 'https://evil.example/orgs/example/projects/1' })).toThrow('github.com');
  });
});
