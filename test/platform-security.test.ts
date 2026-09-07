import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { BridgeServer } from '../src/server.js';
import { hashPlatformToken } from '../src/platform-auth.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';
import type { BridgeConfig } from '../src/types.js';

const BRIDGE_TOKEN = 'bridge-administrator-token-for-platform-tests';
const VIEWER_TOKEN = 'viewer-token-with-at-least-thirty-two-bytes';
const OPERATOR_TOKEN = 'operator-token-with-at-least-thirty-two-bytes';
const REVIEWER_TOKEN = 'reviewer-token-with-at-least-thirty-two-bytes';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') return reject(new Error('No TCP port assigned'));
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function auth(token: string): HeadersInit { return { Authorization: `Bearer ${token}` }; }

describe('platform HTTP security boundaries', () => {
  let server: BridgeServer;
  let base: string;

  beforeAll(async () => {
    const port = await freePort();
    const cfg: BridgeConfig = {
      host: '127.0.0.1', port, logLevel: 'silent', authToken: BRIDGE_TOKEN,
      apiKeys: { 'claude-api': 'runtime-only-test-credential' },
      platformAuth: { operators: [
        { id: 'viewer-1', role: 'viewer', workspaceIds: ['*'], tokenHash: hashPlatformToken(VIEWER_TOKEN) },
        { id: 'operator-1', role: 'operator', workspaceIds: ['*'], tokenHash: hashPlatformToken(OPERATOR_TOKEN) },
        { id: 'reviewer-1', role: 'reviewer', workspaceIds: ['*'], tokenHash: hashPlatformToken(REVIEWER_TOKEN) },
      ] },
      rateLimit: { perMinute: 1000, maxConcurrent: 16 },
    };
    server = new BridgeServer(cfg, { platformStore: new TransactionalStateStore(new MemorySnapshotBackend()) });
    await server.start();
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => { await server.stop(); });

  it('keeps platform tokens scoped and omits verifiers and provider credentials', async () => {
    const me = await fetch(`${base}/v1/platform/me`, { headers: auth(VIEWER_TOKEN) });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ operator: { operatorId: 'viewer-1', role: 'viewer' } });

    expect((await fetch(`${base}/v1/settings`, { headers: auth(VIEWER_TOKEN) })).status).toBe(401);
    expect((await fetch(`${base}/v1/platform/operators`, { headers: auth(VIEWER_TOKEN) })).status).toBe(403);

    const operators = await fetch(`${base}/v1/platform/operators`, { headers: auth(BRIDGE_TOKEN) });
    const operatorsText = await operators.text();
    expect(operators.status).toBe(200);
    expect(operatorsText).not.toContain('tokenHash');
    expect(operatorsText).not.toContain(VIEWER_TOKEN);

    const settings = await fetch(`${base}/v1/settings`, { headers: auth(BRIDGE_TOKEN) });
    const settingsText = await settings.text();
    expect(settings.status).toBe(200);
    expect(settingsText).not.toContain('runtime-only-test-credential');
    expect(JSON.parse(settingsText).apiKeys['claude-api']).toMatchObject({ configured: true });
  });

  it('enforces operate and review as separate capabilities', async () => {
    const viewerCreate = await fetch(`${base}/v1/platform/sessions`, {
      method: 'POST', headers: { ...auth(VIEWER_TOKEN), 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(viewerCreate.status).toBe(403);

    const directApproval = await fetch(`${base}/v1/platform/memories`, {
      method: 'POST', headers: { ...auth(OPERATOR_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Candidate', content: 'review me', status: 'approved' }),
    });
    expect(directApproval.status).toBe(403);

    const created = await fetch(`${base}/v1/platform/memories`, {
      method: 'POST', headers: { ...auth(OPERATOR_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Candidate', content: 'review me' }),
    });
    expect(created.status).toBe(201);
    const memory = (await created.json()).memory;
    expect(memory.status).toBe('candidate');

    const operatorApproval = await fetch(`${base}/v1/platform/memories/${memory.id}`, {
      method: 'PATCH', headers: { ...auth(OPERATOR_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', expectedRevision: memory.revision }),
    });
    expect(operatorApproval.status).toBe(403);

    const approved = await fetch(`${base}/v1/platform/memories/${memory.id}`, {
      method: 'PATCH', headers: { ...auth(BRIDGE_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', expectedRevision: memory.revision }),
    });
    expect(approved.status).toBe(200);
    const reviewed = (await approved.json()).memory;
    expect(reviewed).toMatchObject({ status: 'approved', reviewedBy: 'local-admin' });

    const edited = await fetch(`${base}/v1/platform/memories/${memory.id}`, {
      method: 'PATCH', headers: { ...auth(OPERATOR_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'changed after review', expectedRevision: reviewed.revision }),
    });
    expect(edited.status).toBe(200);
    const changed = (await edited.json()).memory;
    expect(changed.status).toBe('candidate');
    expect(changed.reviewedBy).toBeUndefined();
    expect(changed.reviewedAt).toBeUndefined();

    const hidden = await fetch(`${base}/v1/platform/memories`, { headers: auth(VIEWER_TOKEN) });
    expect(await hidden.json()).toEqual({ data: [] });
  });

  it('never exposes the queued credential fingerprint in run responses', async () => {
    const created = await fetch(`${base}/v1/platform/runs`, {
      method: 'POST', headers: { ...auth(OPERATOR_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Wait for review', model: 'cli-codex/gpt-5.6-sol', requiresApproval: true }),
    });
    const createdText = await created.text();
    expect(created.status).toBe(202);
    expect(createdText).not.toContain('authorizationVersion');
    const runId = JSON.parse(createdText).run.id;

    const listed = await fetch(`${base}/v1/platform/runs`, { headers: auth(OPERATOR_TOKEN) });
    expect(await listed.text()).not.toContain('authorizationVersion');

    const cancelled = await fetch(`${base}/v1/platform/runs/${runId}/actions`, {
      method: 'POST', headers: { ...auth(OPERATOR_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.text()).not.toContain('authorizationVersion');
  });
});
