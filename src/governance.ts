import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runtimeDir } from './config.js';
import type { RepositoryConfig, GovernanceAuditRecord } from './types.js';

export class GovernanceManager {
  private repositories: RepositoryConfig[] = [];
  private auditTrail: GovernanceAuditRecord[] = [];
  private readonly repoFile: string;
  private readonly auditFile: string;

  constructor(
    repoFile = join(runtimeDir(), 'repositories.json'),
    auditFile = join(runtimeDir(), 'audit-trail.json'),
  ) {
    this.repoFile = repoFile;
    this.auditFile = auditFile;
    this.load();
  }

  private load(): void {
    if (existsSync(this.repoFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.repoFile, 'utf8'));
        if (Array.isArray(parsed)) this.repositories = parsed;
      } catch { /* ignore parse error */ }
    }
    if (existsSync(this.auditFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.auditFile, 'utf8'));
        if (Array.isArray(parsed)) this.auditTrail = parsed.slice(-200);
      } catch { /* ignore parse error */ }
    }

    // Initialize with current workspace if empty
    if (this.repositories.length === 0) {
      const cwd = process.cwd();
      this.repositories.push({
        id: 'elvatis/conduit-bridge',
        name: 'Conduit Bridge',
        path: cwd,
        description: 'Local multi-provider model gateway and agent control plane',
        assignedGovernancePipeline: 'standard-governance',
        enabledPipelines: ['standard-governance', 'tri-vendor-review', 'pr-review', 'release-readiness'],
        defaultWorkspace: cwd,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      this.saveRepositories();
    }
  }

  private saveRepositories(): void {
    try {
      mkdirSync(dirname(this.repoFile), { recursive: true });
      writeFileSync(this.repoFile, JSON.stringify(this.repositories, null, 2), { mode: 0o600 });
      chmodSync(this.repoFile, 0o600);
    } catch { /* ignore */ }
  }

  private saveAuditTrail(): void {
    try {
      mkdirSync(dirname(this.auditFile), { recursive: true });
      writeFileSync(this.auditFile, JSON.stringify(this.auditTrail.slice(-200), null, 2), { mode: 0o600 });
      chmodSync(this.auditFile, 0o600);
    } catch { /* ignore */ }
  }

  listRepositories(): RepositoryConfig[] {
    return [...this.repositories];
  }

  getRepository(idOrPath: string): RepositoryConfig | undefined {
    const trimmed = idOrPath.trim();
    const resolved = resolve(trimmed);
    return this.repositories.find(r => r.id === trimmed || resolve(r.path) === resolved);
  }

  saveRepository(repo: RepositoryConfig): RepositoryConfig {
    const norm = resolve(repo.path);
    const existingIndex = this.repositories.findIndex(r => r.id === repo.id || resolve(r.path) === norm);
    const now = Date.now();
    const updated: RepositoryConfig = {
      ...repo,
      path: norm,
      updatedAt: now,
      createdAt: existingIndex >= 0 ? (this.repositories[existingIndex].createdAt || now) : now,
    };

    if (existingIndex >= 0) {
      this.repositories[existingIndex] = updated;
    } else {
      this.repositories.push(updated);
    }

    this.saveRepositories();
    return updated;
  }

  deleteRepository(id: string): boolean {
    const prev = this.repositories.length;
    this.repositories = this.repositories.filter(r => r.id !== id);
    if (this.repositories.length !== prev) {
      this.saveRepositories();
      return true;
    }
    return false;
  }

  recordAudit(entry: Omit<GovernanceAuditRecord, 'auditId' | 'timestamp'>): GovernanceAuditRecord {
    const record: GovernanceAuditRecord = {
      ...entry,
      auditId: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    this.auditTrail.push(record);
    this.saveAuditTrail();
    return record;
  }

  listAuditTrail(filter?: { repository?: string; action?: string; limit?: number }): GovernanceAuditRecord[] {
    let list = [...this.auditTrail].reverse();
    if (filter?.repository) {
      list = list.filter(a => a.repository === filter.repository);
    }
    if (filter?.action) {
      list = list.filter(a => a.action === filter.action);
    }
    if (filter?.limit && filter.limit > 0) {
      list = list.slice(0, filter.limit);
    }
    return list;
  }

  exportAuditTrail(format: 'json' | 'markdown'): string {
    const list = this.listAuditTrail();
    if (format === 'json') {
      return JSON.stringify(list, null, 2);
    }

    const lines = [
      '# Governance Approval Audit Trail',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Events: ${list.length}`,
      '',
      '| Timestamp | Repository | Pipeline | Step | Action | Operator | Feedback | Run ID |',
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ];

    for (const item of list) {
      const time = new Date(item.timestamp).toISOString();
      const repo = item.repository || 'default';
      const feedback = (item.feedback || '-').replace(/\|/g, '\\|');
      lines.push(`| ${time} | ${repo} | ${item.pipelineName} | ${item.stepName} | **${item.action.toUpperCase()}** | ${item.operator} | ${feedback} | \`${item.runId}\` |`);
    }

    return lines.join('\n');
  }
}
