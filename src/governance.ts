import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runtimeDir } from './config.js';
import type { RepositoryConfig, GovernanceAuditRecord } from './types.js';
import { canonicalDirectory, isPathWithin } from './workspaces.js';
import { redactSecrets } from './redact.js';

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
        if (Array.isArray(parsed)) {
          this.auditTrail = parsed.slice(-200).filter(item =>
            item && typeof item === 'object' && Number.isFinite(item.timestamp) &&
            typeof item.auditId === 'string' && typeof item.pipelineId === 'string' &&
            typeof item.pipelineName === 'string' && typeof item.runId === 'string' &&
            typeof item.stepId === 'string' && typeof item.stepName === 'string' &&
            typeof item.operator === 'string' && ['approved', 'rejected'].includes(item.action)
          ).map(item => ({
            ...item,
            pipelineId: redactSecrets(item.pipelineId), pipelineName: redactSecrets(item.pipelineName),
            runId: redactSecrets(item.runId), stepId: redactSecrets(item.stepId), stepName: redactSecrets(item.stepName),
            operator: redactSecrets(item.operator),
            model: typeof item.model === 'string' ? redactSecrets(item.model) : undefined,
            repository: typeof item.repository === 'string' ? redactSecrets(item.repository) : undefined,
            feedback: typeof item.feedback === 'string' ? redactSecrets(item.feedback) : undefined,
            correlationId: typeof item.correlationId === 'string' ? redactSecrets(item.correlationId) : undefined,
          }));
          this.saveAuditTrail();
        }
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
    return structuredClone(this.repositories);
  }

  getRepository(idOrPath: string): RepositoryConfig | undefined {
    const trimmed = idOrPath.trim();
    const canonical = canonicalDirectory(trimmed);
    return this.repositories.find(r => r.id === trimmed || (canonical && canonicalDirectory(r.path) === canonical));
  }

  /** Find the most specific registered repository containing a directory. */
  findRepositoryForPath(targetPath: string): RepositoryConfig | undefined {
    const canonical = canonicalDirectory(targetPath);
    if (!canonical) return undefined;
    return this.repositories
      .map(repo => ({ repo, root: canonicalDirectory(repo.path) }))
      .filter((item): item is { repo: RepositoryConfig; root: string } => Boolean(item.root) && isPathWithin(item.root!, canonical))
      .sort((a, b) => b.root.length - a.root.length)[0]?.repo;
  }

  saveRepository(repo: RepositoryConfig): RepositoryConfig {
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(repo.id) || repo.id.includes('..')) throw new Error('Repository id must be a safe identifier');
    const norm = canonicalDirectory(repo.path);
    if (!norm) throw new Error('Repository path must be an existing absolute directory');
    const defaultWorkspace = repo.defaultWorkspace ? canonicalDirectory(repo.defaultWorkspace) : undefined;
    if (repo.defaultWorkspace && (!defaultWorkspace || !isPathWithin(norm, defaultWorkspace))) {
      throw new Error('Repository default workspace must be inside the repository path');
    }
    const existingIndex = this.repositories.findIndex(r => r.id === repo.id || canonicalDirectory(r.path) === norm);
    const now = Date.now();
    const updated: RepositoryConfig = {
      ...repo,
      path: norm,
      ...(defaultWorkspace ? { defaultWorkspace } : {}),
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
      pipelineId: redactSecrets(entry.pipelineId),
      pipelineName: redactSecrets(entry.pipelineName),
      runId: redactSecrets(entry.runId),
      stepId: redactSecrets(entry.stepId),
      stepName: redactSecrets(entry.stepName),
      model: entry.model ? redactSecrets(entry.model) : undefined,
      repository: entry.repository ? redactSecrets(entry.repository) : undefined,
      operator: redactSecrets(entry.operator),
      feedback: entry.feedback ? redactSecrets(entry.feedback) : undefined,
      correlationId: entry.correlationId ? redactSecrets(entry.correlationId) : undefined,
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
      const cell = (value: string | undefined, fallback = '-') => (value || fallback).replace(/\|/g, '\\|');
      lines.push(`| ${time} | ${cell(item.repository, 'default')} | ${cell(item.pipelineName)} | ${cell(item.stepName)} | **${item.action.toUpperCase()}** | ${cell(item.operator)} | ${cell(item.feedback)} | \`${cell(item.runId)}\` |`);
    }

    return lines.join('\n');
  }
}
