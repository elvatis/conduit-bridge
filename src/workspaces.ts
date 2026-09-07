import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, accessSync, readdirSync, constants } from 'node:fs';
import { dirname, join, isAbsolute, basename, resolve } from 'node:path';
import { runtimeDir } from './config.js';
import type { WorkspaceEntry } from './types.js';

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

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.workspaces.slice(0, 30), null, 2), { mode: 0o600 });
      chmodSync(this.file, 0o600);
    } catch { /* ignore write failure */ }
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

    const normPath = resolve(trimmed);
    const existingIndex = this.workspaces.findIndex(w => resolve(w.path) === normPath);

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
    const norm = resolve(wsPath);
    const item = this.workspaces.find(w => resolve(w.path) === norm);
    if (item) {
      item.lastUsed = Date.now();
      this.save();
    }
  }

  removeWorkspace(idOrPath: string): boolean {
    const prev = this.workspaces.length;
    let norm = '';
    try { norm = resolve(idOrPath); } catch {}
    this.workspaces = this.workspaces.filter(w => w.id !== idOrPath && (!norm || resolve(w.path) !== norm));
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
