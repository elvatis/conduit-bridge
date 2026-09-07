import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { GovernanceManager } from '../src/governance.js';
import { BudgetManager } from '../src/budget.js';
import { WorkspaceManager } from '../src/workspaces.js';
import { BridgeServer } from '../src/server.js';
import type { BridgeConfig } from '../src/types.js';

describe('Governance Subsystem', () => {
  let tmpDir: string;
  let repoFile: string;
  let auditFile: string;
  let govManager: GovernanceManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'conduit-gov-test-'));
    repoFile = join(tmpDir, 'repos.json');
    auditFile = join(tmpDir, 'audit.json');
    govManager = new GovernanceManager(repoFile, auditFile);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes default repository when empty', () => {
    const repos = govManager.listRepositories();
    expect(repos.length).toBe(1);
    expect(repos[0].id).toBe('elvatis/conduit-bridge');
    expect(repos[0].assignedGovernancePipeline).toBe('standard-governance');
    expect(repos[0].enabledPipelines).toContain('standard-governance');
  });

  it('saves and updates repository configuration', () => {
    const customRepo = {
      id: 'acme/service-mesh',
      name: 'Service Mesh',
      path: tmpDir,
      description: 'Acme core mesh layer',
      assignedGovernancePipeline: 'release-readiness',
      enabledPipelines: ['release-readiness', 'architecture-review'],
      policyOverrides: { requireSecuritySignoff: true },
    };

    const saved = govManager.saveRepository(customRepo);
    expect(saved.id).toBe('acme/service-mesh');
    expect(saved.assignedGovernancePipeline).toBe('release-readiness');

    const found = govManager.getRepository('acme/service-mesh');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Service Mesh');

    const byPath = govManager.getRepository(tmpDir);
    expect(byPath?.id).toBe('acme/service-mesh');
  });

  it('finds the most specific repository for a canonical child path', () => {
    const root = join(tmpDir, 'repo');
    const nested = join(root, 'packages', 'api');
    mkdirSync(nested, { recursive: true });
    govManager.saveRepository({ id: 'acme/root', name: 'Root', path: root });
    govManager.saveRepository({ id: 'acme/api', name: 'API', path: nested });
    expect(govManager.findRepositoryForPath(join(nested, '.'))?.id).toBe('acme/api');
  });

  it('rejects invalid repository roots and escaping default workspaces', () => {
    const root = join(tmpDir, 'repo');
    const outside = join(tmpDir, 'outside');
    mkdirSync(root);
    mkdirSync(outside);
    expect(() => govManager.saveRepository({ id: 'bad..repo', name: 'Bad', path: root })).toThrow(/identifier/i);
    expect(() => govManager.saveRepository({ id: 'acme/missing', name: 'Missing', path: join(tmpDir, 'missing') })).toThrow(/existing absolute/i);
    expect(() => govManager.saveRepository({ id: 'acme/escape', name: 'Escape', path: root, defaultWorkspace: outside })).toThrow(/inside/i);
  });

  it('records audit events and filters them correctly', () => {
    govManager.recordAudit({
      repository: 'acme/repo1',
      pipelineId: 'standard-governance',
      pipelineName: 'Standard Governance',
      stepId: 'step-compliance',
      stepName: 'Compliance Review',
      action: 'approved',
      operator: 'alice',
      feedback: 'Approved after verification',
      runId: 'run-101',
      correlationId: 'trace-101',
    });

    govManager.recordAudit({
      repository: 'acme/repo2',
      pipelineId: 'pr-review',
      pipelineName: 'Automated PR Review',
      stepId: 'step-sec',
      stepName: 'Security Gate',
      action: 'rejected',
      operator: 'bob',
      feedback: 'Dependency CVE detected',
      runId: 'run-102',
      correlationId: 'trace-102',
    });

    const all = govManager.listAuditTrail();
    expect(all.length).toBe(2);

    const filteredRepo = govManager.listAuditTrail({ repository: 'acme/repo1' });
    expect(filteredRepo.length).toBe(1);
    expect(filteredRepo[0].operator).toBe('alice');

    const filteredAction = govManager.listAuditTrail({ action: 'rejected' });
    expect(filteredAction.length).toBe(1);
    expect(filteredAction[0].operator).toBe('bob');
  });

  it('exports audit trail as JSON and Markdown tables', () => {
    govManager.recordAudit({
      repository: 'elvatis/test',
      pipelineId: 'standard-governance',
      pipelineName: 'Standard Governance',
      stepId: 'step-1',
      stepName: 'Implementation',
      action: 'approved',
      operator: 'lead',
      feedback: 'LGTM',
      runId: 'run-1',
    });

    const jsonExport = govManager.exportAuditTrail('json');
    const parsed = JSON.parse(jsonExport);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].operator).toBe('lead');

    const mdExport = govManager.exportAuditTrail('markdown');
    expect(mdExport).toContain('# Governance Approval Audit Trail');
    expect(mdExport).toContain('| Timestamp | Repository | Pipeline | Step | Action | Operator | Feedback | Run ID |');
    expect(mdExport).toContain('elvatis/test');
    expect(mdExport).toContain('**APPROVED**');
  });

  it('deletes repository by ID', () => {
    govManager.saveRepository({
      id: 'deletable/repo',
      name: 'To Delete',
      path: tmpDir,
    });
    expect(govManager.getRepository('deletable/repo')).toBeDefined();

    const ok = govManager.deleteRepository('deletable/repo');
    expect(ok).toBe(true);
    expect(govManager.getRepository('deletable/repo')).toBeUndefined();
  });
});

describe('Budget Subsystem', () => {
  let tmpDir: string;
  let usageFile: string;
  let budgetManager: BudgetManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'conduit-budget-test-'));
    usageFile = join(tmpDir, 'budget-usage.json');
    budgetManager = new BudgetManager({
      maxCostPerRunUsd: 0.10,
      maxTokensPerRun: 10000,
      dailyBudgetUsd: 1.00,
      monthlyBudgetUsd: 20.00,
      warningThresholdPercent: 80,
      hardStop: true,
    }, usageFile);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calculates initial status with zero spend', () => {
    const status = budgetManager.getStatus();
    expect(status.dailyPercent).toBe(0);
    expect(status.monthlyPercent).toBe(0);
    expect(status.dailyWarning).toBe(false);
    expect(status.dailyExceeded).toBe(false);
  });

  it('records spend and triggers warnings and hard stops', () => {
    budgetManager.recordSpend(0.85, 4000);
    const status = budgetManager.getStatus();
    expect(status.dailyPercent).toBe(85);
    expect(status.dailyWarning).toBe(true);
    expect(status.dailyExceeded).toBe(false);

    const warnCheck = budgetManager.checkRunBudget(0.01, 100);
    expect(warnCheck.allowed).toBe(true);
    expect(warnCheck.warning).toContain('Daily budget warning: 85% consumed');

    // Spend exceeds $1.00 daily budget
    budgetManager.recordSpend(0.20, 1000);
    const stopCheck = budgetManager.checkRunBudget(0.01, 100);
    expect(stopCheck.allowed).toBe(false);
    expect(stopCheck.reason).toContain('Daily budget of $1.00 exceeded');
  });

  it('enforces per-run limits', () => {
    const singleRunCheck = budgetManager.checkRunBudget(0.25, 2000);
    expect(singleRunCheck.allowed).toBe(false);
    expect(singleRunCheck.reason).toContain('exceeds maximum run limit ($0.10)');

    const tokenRunCheck = budgetManager.checkRunBudget(0.01, 15000);
    expect(tokenRunCheck.allowed).toBe(false);
    expect(tokenRunCheck.reason).toContain('exceeds maximum run limit (10000)');
  });
});

describe('Workspace Subsystem', () => {
  let tmpDir: string;
  let wsFile: string;
  let wsManager: WorkspaceManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'conduit-ws-test-'));
    wsFile = join(tmpDir, 'workspaces.json');
    wsManager = new WorkspaceManager(wsFile);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes default workspace', () => {
    const list = wsManager.listWorkspaces();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].exists).toBe(true);
  });

  it('validates directory existence and write permissions', () => {
    const subDir = join(tmpDir, 'project-alpha');
    mkdirSync(subDir);

    const res = wsManager.addOrUpdateWorkspace(subDir, 'Project Alpha', true);
    expect(res.ok).toBe(true);
    expect(res.entry?.name).toBe('Project Alpha');
    expect(res.entry?.isDefault).toBe(true);

    const badRes = wsManager.addOrUpdateWorkspace(join(tmpDir, 'non-existent-dir'));
    expect(badRes.ok).toBe(false);
    expect(badRes.error).toContain('Directory does not exist');
  });

  it('browses child directories with write accessibility status', () => {
    const child1 = join(tmpDir, 'src');
    const child2 = join(tmpDir, 'docs');
    mkdirSync(child1);
    mkdirSync(child2);

    const browse = wsManager.browseDirectory(tmpDir);
    expect(browse.current).toBe(tmpDir);
    expect(browse.directories.some(d => d.name === 'src')).toBe(true);
    expect(browse.directories.some(d => d.name === 'docs')).toBe(true);
  });

  it('resolves only canonical directories inside an approved root', () => {
    const root = join(tmpDir, 'repo');
    const child = join(root, 'src');
    const outside = join(tmpDir, 'outside');
    mkdirSync(child, { recursive: true });
    mkdirSync(outside);
    expect(wsManager.resolveWorkingDirectory(child, [root], false)).toMatchObject({ ok: true });
    expect(wsManager.resolveWorkingDirectory(outside, [root], false)).toMatchObject({ ok: false });

    const escape = join(root, 'linked-outside');
    symlinkSync(outside, escape, process.platform === 'win32' ? 'junction' : 'dir');
    expect(wsManager.resolveWorkingDirectory(escape, [root], false)).toMatchObject({ ok: false });
  });
});

describe('Enterprise Endpoints Integration', () => {
  let server: BridgeServer;
  let base: string;

  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createServer();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(port));
      });
    });
  }

  beforeEach(async () => {
    const port = await getFreePort();
    const cfg: BridgeConfig = {
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      apiKeys: {},
    };
    server = new BridgeServer(cfg);
    await server.start();
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('GET /v1/tools returns known tools and discovered system tools', async () => {
    const res = await fetch(`${base}/v1/tools`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.object).toBe('list');
    expect(Array.isArray(json.data)).toBe(true);
    expect(Array.isArray(json.system_tools)).toBe(true);
    expect(json.data.length).toBeGreaterThan(15);
    const bash = json.data.find((t: any) => t.name === 'Bash');
    expect(bash.displayName).toBe('Terminal Command Shell');
    expect(bash.classification).toBe('System Modify');
  });

  it('GET and POST /v1/budgets manages platform limits', async () => {
    const getRes = await fetch(`${base}/v1/budgets`);
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.object).toBe('conduit.budget');
    expect(getJson.config).toBeDefined();

    const postRes = await fetch(`${base}/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyBudgetUsd: 25.0,
        monthlyBudgetUsd: 250.0,
      }),
    });
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.config.dailyBudgetUsd).toBe(25.0);
    expect(postJson.config.monthlyBudgetUsd).toBe(250.0);
  });

  it('GET, POST, and DELETE /v1/repositories manages repository assignments', async () => {
    const listRes = await fetch(`${base}/v1/repositories`);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(Array.isArray(listJson.data)).toBe(true);
    expect(listJson.data.length).toBeGreaterThanOrEqual(1);

    const postRes = await fetch(`${base}/v1/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-org/test-repo',
        name: 'Test Repo',
        path: process.cwd(),
        assignedGovernancePipeline: 'pr-review',
      }),
    });
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.repository.id).toBe('test-org/test-repo');

    const delRes = await fetch(`${base}/v1/repositories/test-org%2Ftest-repo`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
    const delJson = await delRes.json();
    expect(delJson.status).toBe('deleted');
  });

  it('GET /v1/analytics/overview returns aggregated statistics', async () => {
    const res = await fetch(`${base}/v1/analytics/overview`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.object).toBe('conduit.analytics_overview');
    expect(data.totals).toBeDefined();
    expect(data.pipelines).toBeDefined();
    expect(data.budget).toBeDefined();
    expect(data.governance).toBeDefined();
    expect(data.activity).toBeDefined();
  });

  it('GET /v1/activity/export exports operational logs', async () => {
    const jsonRes = await fetch(`${base}/v1/activity/export?format=json`);
    expect(jsonRes.status).toBe(200);
    const jsonLogs = await jsonRes.json();
    expect(Array.isArray(jsonLogs)).toBe(true);

    const mdRes = await fetch(`${base}/v1/activity/export?format=markdown`);
    expect(mdRes.status).toBe(200);
    const mdLogs = await mdRes.text();
    expect(mdLogs).toContain('# Conduit Bridge Activity Log');
    expect(mdLogs).toContain('| Time | Level | Scope | Message |');
  });

  it('GET /v1/governance/audit/export exports audit records', async () => {
    const mdRes = await fetch(`${base}/v1/governance/audit/export?format=markdown`);
    expect(mdRes.status).toBe(200);
    const mdText = await mdRes.text();
    expect(mdText).toContain('# Governance Approval Audit Trail');
  });
});
