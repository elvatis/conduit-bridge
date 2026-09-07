import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, accessSync, readdirSync, constants, realpathSync } from 'node:fs';
import { dirname, join, isAbsolute, basename, resolve, relative, sep } from 'node:path';
import { runtimeDir } from './config.js';
import type { WorkspaceEntry, GitHubProjectLink } from './types.js';

/** Resolve an existing directory through symlinks/junctions for boundary checks. */
export function canonicalDirectory(targetPath: string): string | undefined {
  if (typeof targetPath !== 'string' || !targetPath.trim() || !isAbsolute(targetPath.trim())) return undefined;
  try {
    const canonical = realpathSync.native(resolve(targetPath.trim()));
    return statSync(canonical).isDirectory() ? canonical : undefined;
  } catch {
    return undefined;
  }
}

/** True when candidate is the root itself or one of its descendants. */
export function isPathWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export class WorkspaceManager {
  private workspaces: WorkspaceEntry[] = [];
  private readonly file: string;

  constructor(file = join(runtimeDir(), 'workspaces.json')) {
    this.file = file;
    this.load();
  }

  private load(): void {
    if (existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
        if (Array.isArray(parsed)) {
          this.workspaces = parsed;
        }
      } catch { /* ignore parse errors */ }
    }

    // Ensure current project workspace is present by default
    if (this.workspaces.length === 0) {
      const defaultPath = process.cwd();
      this.workspaces.push({
        id: 'ws-default',
        path: defaultPath,
        name: basename(defaultPath) || 'Current Workspace',
        lastUsed: Date.now(),
        isDefault: true,
      });
      this.save();
    }
  }

  private save(): boolean {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.workspaces.slice(0, 30), null, 2), { mode: 0o600 });
      chmodSync(this.file, 0o600);
      return true;
    } catch { return false; }
  }

  listWorkspaces(): WorkspaceEntry[] {
    return this.workspaces.map(w => {
      let exists = false;
      let writable = false;
      try {
        if (isAbsolute(w.path) && existsSync(w.path)) {
          const st = statSync(w.path);
          if (st.isDirectory()) {
            exists = true;
            try {
              accessSync(w.path, constants.W_OK);
              writable = true;
            } catch {
              writable = false;
            }
          }
        }
      } catch { /* fallback to false */ }
      return {
        ...w,
        exists,
        writable,
      };
    }).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  getDefaultWorkspace(): WorkspaceEntry | undefined {
    return this.workspaces.find(w => w.isDefault) ?? this.workspaces[0];
  }

  /**
   * Resolve a request working directory and prove that it stays within an
   * approved root after following symlinks and Windows junctions.
   */
  resolveWorkingDirectory(candidate?: string, additionalRoots: string[] = [], includeRegistered = true): {
    ok: boolean;
    path?: string;
    error?: string;
  } {
    const requested = candidate?.trim() || this.getDefaultWorkspace()?.path;
    if (!requested) return { ok: false, error: 'No default workspace is configured' };
    const canonical = canonicalDirectory(requested);
    if (!canonical) return { ok: false, error: 'Working directory must be an existing absolute directory' };

    const roots = [...additionalRoots, ...(includeRegistered ? this.workspaces.map(w => w.path) : [])]
      .map(canonicalDirectory)
      .filter((root): root is string => Boolean(root));
    if (!roots.some(root => isPathWithin(root, canonical))) {
      return { ok: false, error: 'Working directory is outside every registered repository or workspace' };
    }
    return { ok: true, path: canonical };
  }

  addOrUpdateWorkspace(wsPath: string, name?: string, isDefault = false): {
    ok: boolean;
    entry?: WorkspaceEntry;
    error?: string;
  } {
    const trimmed = wsPath.trim();
    if (!trimmed) {
      return { ok: false, error: 'Path is required' };
    }
    if (!isAbsolute(trimmed)) {
      return { ok: false, error: 'Path must be an absolute path' };
    }
    if (!existsSync(trimmed)) {
      return { ok: false, error: 'Directory does not exist on disk' };
    }
    try {
      const st = statSync(trimmed);
      if (!st.isDirectory()) {
        return { ok: false, error: 'Target path is a file, not a directory' };
      }
    } catch (err: any) {
      return { ok: false, error: `Stat error: ${err.message}` };
    }

    let writable = false;
    try {
      accessSync(trimmed, constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }

    const normPath = canonicalDirectory(trimmed)!;
    const existingIndex = this.workspaces.findIndex(w => canonicalDirectory(w.path) === normPath);

    if (isDefault) {
      this.workspaces.forEach(w => { w.isDefault = false; });
    }

    const entry: WorkspaceEntry = {
      id: existingIndex >= 0 ? this.workspaces[existingIndex].id : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path: normPath,
      name: name?.trim() || basename(normPath) || normPath,
      lastUsed: Date.now(),
      isDefault: isDefault || (this.workspaces.length === 0),
      exists: true,
      writable,
      ...(existingIndex >= 0 && this.workspaces[existingIndex].githubProject ? { githubProject: structuredClone(this.workspaces[existingIndex].githubProject) } : {}),
    };

    if (existingIndex >= 0) {
      this.workspaces[existingIndex] = entry;
    } else {
      this.workspaces.unshift(entry);
    }

    this.save();
    return { ok: true, entry };
  }

  touchWorkspace(wsPath: string): void {
    const norm = canonicalDirectory(wsPath);
    const item = norm ? this.workspaces.find(w => canonicalDirectory(w.path) === norm) : undefined;
    if (item) {
      item.lastUsed = Date.now();
      this.save();
    }
  }

  /** Link or unlink remote project metadata without changing the local root. */
  setGitHubProject(workspaceId: string, project: GitHubProjectLink | null): WorkspaceEntry {
    const workspace = this.workspaces.find(item => item.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');
    if (project !== null) {
      if (!project || typeof project.projectId !== 'string' || !/^[A-Za-z0-9_+=/-]{1,256}$/.test(project.projectId) || typeof project.org !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(project.org)) throw new Error('Invalid GitHub project association');
      const url = new URL(project.projectUrl);
      const match = /^\/(orgs|users)\/([A-Za-z0-9-]+)\/projects\/([1-9][0-9]*)\/?$/.exec(url.pathname);
      if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || !match || match[2].toLowerCase() !== project.org.toLowerCase()) throw new Error('Project URL must identify the selected owner on github.com');
      if (project.repo !== undefined && (typeof project.repo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(project.repo))) throw new Error('Repository must use owner/repository format');
    }
    const previous = workspace.githubProject;
    if (project === null) delete workspace.githubProject;
    else workspace.githubProject = { projectId: project.projectId, projectUrl: project.projectUrl, org: project.org, ...(project.repo ? { repo: project.repo } : {}) };
    if (!this.save()) { workspace.githubProject = previous; throw new Error('Could not persist workspace project association'); }
    return structuredClone(workspace);
  }

  removeWorkspace(idOrPath: string): boolean {
    const prev = this.workspaces.length;
    const norm = canonicalDirectory(idOrPath);
    this.workspaces = this.workspaces.filter(w => w.id !== idOrPath && (!norm || canonicalDirectory(w.path) !== norm));
    if (this.workspaces.length !== prev) {
      this.save();
      return true;
    }
    return false;
  }

  browseDirectory(targetPath?: string): {
    current: string;
    parent?: string;
    directories: Array<{ name: string; path: string; writable: boolean }>;
  } {
    const root = targetPath && isAbsolute(targetPath) && existsSync(targetPath)
      ? resolve(targetPath)
      : process.cwd();

    const parent = dirname(root) !== root ? dirname(root) : undefined;
    const directories: Array<{ name: string; path: string; writable: boolean }> = [];

    try {
      const items = readdirSync(root, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const itemPath = join(root, item.name);
          let isWritable = false;
          try {
            accessSync(itemPath, constants.W_OK);
            isWritable = true;
          } catch { /* not writable */ }
          directories.push({
            name: item.name,
            path: itemPath,
            writable: isWritable,
          });
        }
      }
    } catch { /* skip errors */ }

    return {
      current: root,
      parent,
      directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
