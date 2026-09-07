import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ChatRequest, BridgeConfig } from '../src/types.js';

const runtime = vi.hoisted(() => ({ directory: '', requests: [] as ChatRequest[] }));
vi.mock('../src/config.js', async original => ({ ...await original<typeof import('../src/config.js')>(), runtimeDir: () => runtime.directory }));
vi.mock('../src/registry.js', () => {
  const provider = { name: 'perplexity-api', models: [{ id: 'api-perplexity/sonar', provider: 'perplexity-api', displayName: 'Sonar fixture', owned_by: 'test' }], checkSession: async () => true, chat: async (request: ChatRequest) => { runtime.requests.push(request); return 'Synthetic search result.'; } };
  return { ProviderRegistry: class { allModels() { return provider.models; } providerForModel(model: string) { return provider.models.some(item => item.id === model) ? provider : undefined; } refreshApiModels = async () => ({}); } };
});
import { BridgeServer } from '../src/server.js';
import { hashPlatformToken } from '../src/platform-auth.js';
import { TransactionalStateStore, MemorySnapshotBackend } from '../src/storage.js';
import { WorkspaceManager } from '../src/workspaces.js';
import { GovernanceManager } from '../src/governance.js';
import type { GitHubProjectsProvider } from '../src/providers/github-projects.js';

const tokens = { admin: 'integration-administrator-fixture-token', operator: 'integration-operator-fixture-token', viewer: 'integration-viewer-fixture-token' };
let server: BridgeServer; let base: string; let workspace: string; let root: string; let cfg: BridgeConfig;
const project = { id: 'PVT_1', title: 'Synthetic project', url: 'https://github.com/orgs/example/projects/1', number: 1, closed: false, fields: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
let projects: { [name: string]: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  runtime.directory = mkdtempSync(join(tmpdir(), 'conduit-integrations-http-')); runtime.requests = [];
  root = join(runtime.directory, 'workspace'); mkdirSync(root);
  const manager = new WorkspaceManager(join(runtime.directory, 'workspaces.json')); workspace = manager.addOrUpdateWorkspace(root, 'Fixture').entry!.id;
  projects = { listProjects: vi.fn(async () => ({ nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } })), getProject: vi.fn(async () => project), listItems: vi.fn(async () => ({ nodes: [], pageInfo: { hasNextPage: false, endCursor: null } })), addItem: vi.fn(async () => ({ id: 'PVTI_1' })), updateItemField: vi.fn(async () => ({ id: 'PVTI_1' })), removeItem: vi.fn(async () => ({ deletedItemId: 'PVTI_1' })) };
  cfg = { host: '127.0.0.1', port: 0, logLevel: 'silent', apiKeys: {}, authToken: tokens.admin, rateLimit: { perMinute: 1000, maxConcurrent: 4 }, platformAuth: { operators: (['operator', 'viewer'] as const).map(id => ({ id, role: id, tokenHash: hashPlatformToken(tokens[id]), workspaceIds: [workspace] })) } };
  server = new BridgeServer(cfg, { workspaceManager: manager, platformStore: new TransactionalStateStore(new MemorySnapshotBackend()), githubProjects: projects as unknown as GitHubProjectsProvider, governanceManager: new GovernanceManager(join(runtime.directory, 'repos.json'), join(runtime.directory, 'audit.json')) });
  await server.start(); base = `http://127.0.0.1:${((server as any)._server.address() as AddressInfo).port}`;
});
afterEach(async () => { await server.stop(); rmSync(runtime.directory, { recursive: true, force: true }); });
async function api(path: string, method = 'GET', body?: unknown, actor: keyof typeof tokens = 'admin', extraHeaders: Record<string, string> = {}) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json', ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
describe('authenticated integration HTTP routes', () => {
  it('lists six tools, enforces mutation consent and scoped roles, and writes the physical file', async () => {
    expect((await api('/v1/platform/tools', 'GET', undefined, 'viewer')).data.data).toHaveLength(6);
    const body = { workspaceId: workspace, arguments: { action: 'write', path: 'hello.txt', content: 'hello tools' } };
    expect((await api('/v1/platform/tools/filesystem/execute', 'POST', body, 'operator')).status).toBe(403);
    expect((await api('/v1/platform/tools/filesystem/execute', 'POST', { ...body, approved: true }, 'viewer')).status).toBe(403);
    expect((await api('/v1/platform/tools/filesystem/execute', 'POST', { ...body, approved: true }, 'operator')).status).toBe(200);
    expect(readFileSync(join(root, 'hello.txt'), 'utf8')).toBe('hello tools');
    expect((await api('/v1/platform/tools/filesystem/execute', 'POST', { workspaceId: workspace, arguments: { action: 'read', path: 'hello.txt' } }, 'viewer')).data.result.content).toBe('hello tools');
    expect((await api('/v1/platform/tools/sandbox/execute', 'POST', { workspaceId: workspace, approved: true, arguments: { executable: 'node', args: ['--version'] } }, 'operator')).status).toBe(403);
  });
  it('routes web search through provider accounting and memory through scoped state', async () => {
    expect((await api('/v1/platform/tools/web-search/execute', 'POST', { arguments: { query: 'Synthetic query' } }, 'operator')).status).toBe(200);
    expect(runtime.requests).toHaveLength(1); expect(runtime.requests[0]).toMatchObject({ model: 'api-perplexity/sonar', mode: 'chat' });
    expect(server.budgetManager.getUsage().currentDailyCostUsd).toBeGreaterThan(0);
    expect((await api('/v1/platform/tools/memory/execute', 'POST', { arguments: { action: 'set', key: 'fixture', value: { result: true } } }, 'operator')).status).toBe(200);
    const own = await api('/v1/platform/tools/memory/execute', 'POST', { arguments: { action: 'get', key: 'fixture' } }, 'operator');
    expect(own.status).toBe(200); expect(JSON.stringify(own.data)).toContain('result');
    const other = await api('/v1/platform/tools/memory/execute', 'POST', { arguments: { action: 'get', key: 'fixture' } }, 'viewer');
    expect(JSON.stringify(other.data)).not.toContain('"result":true');
  });
  it('keeps remote discovery/mutations admin-only and permits linked project reads by workspace scope', async () => {
    expect((await api('/api/github-projects?owner=example&ownerType=organization', 'GET', undefined, 'operator')).status).toBe(403);
    expect((await api('/api/github-projects?owner=example&ownerType=organization')).data.nodes[0].id).toBe('PVT_1');
    const link = { projectId: project.id, projectUrl: project.url, org: 'example', repo: 'example/repository' };
    expect((await api(`/api/github-projects/workspaces/${workspace}`, 'PUT', { githubProject: link })).status).toBe(200);
    expect((await api(`/api/github-projects/PVT_1/items?workspaceId=${workspace}`, 'GET', undefined, 'viewer')).status).toBe(200);
    expect((await api(`/api/github-projects/PVT_other/items?workspaceId=${workspace}`, 'GET', undefined, 'viewer')).status).toBe(403);
    expect((await api('/api/github-projects/PVT_1/items', 'POST', { title: 'Draft' }, 'operator')).status).toBe(403);
    expect((await api('/api/github-projects/PVT_1/items', 'POST', { title: 'Draft' })).status).toBe(201);
    expect((await api('/api/github-projects/PVT_1/items/PVTI_1/fields/FIELD_1', 'PATCH', { value: { text: 'Done' } })).status).toBe(200);
    expect((await api('/api/github-projects/PVT_1/items/PVTI_1', 'DELETE', {})).status).toBe(200);
    expect(projects.addItem).toHaveBeenCalledTimes(1);
    expect((await api(`/api/github-projects/workspaces/${workspace}`, 'DELETE', {})).data.workspace.githubProject).toBeUndefined();
  });
  it('rejects foreign-origin writes, missing credentials and forbidden repository mutations', async () => {
    const response = await fetch(base + '/api/github-projects?owner=example'); expect(response.status).toBe(401);
    expect((await api('/v1/platform/tools/memory/execute', 'POST', { arguments: { action: 'set', key: 'x', value: 1 } }, 'admin', { Origin: 'https://foreign.example' })).status).toBe(403);
    const repository = server.governanceManager.saveRepository({ id: 'test/governed', name: 'Governed', path: root, enabledPipelines: [], overrides: { requireApproval: true } });
    expect(repository).toBeDefined();
    expect((await api('/v1/platform/tools/filesystem/execute', 'POST', { workspaceId: workspace, approved: true, arguments: { action: 'write', path: 'blocked.txt', content: 'no' } })).status).toBe(403);
  });
});
