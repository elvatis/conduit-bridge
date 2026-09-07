import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlatformVaultService } from '../src/platform-vault.js';
import { PlatformContentService } from '../src/platform-content.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';
import { runLocalTool } from '../src/providers/llama-server.js';

vi.mock('../src/providers/llama-server.js', () => ({ runLocalTool: vi.fn() }));
const directories: string[] = [];
const services: PlatformVaultService[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.stop(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.resetAllMocks(); });
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'conduit-vault-')); directories.push(directory);
  const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
  const content = new PlatformContentService(store);
  let now = 1000, authorized = true;
  const sessions = vi.fn((owner: string) => { if (!authorized) throw new Error('Revoked'); return content.listSessions({ userId: owner }); });
  const analyze = vi.fn(async () => JSON.stringify({ suggestions: [{ title: 'Add acceptance criteria', reason: 'Repeated requests for measurable tests', prompt: 'Implement this change and state measurable acceptance criteria.', sources: [0, 1] }] }));
  const vault = new PlatformVaultService(store, { directory, now: () => now, sessions, analyze }); services.push(vault);
  async function conversation(owner: string, prompt: string, answer = 'Please include acceptance criteria.') {
    const s = await content.createSession({ userId: owner, title: 'Generic title' });
    return (await content.runTurn(s.id, { input: prompt, provider: 'cli-codex', model: 'cli-codex/test' }, async () => answer)).session;
  }
  return { directory, store, content, vault, analyze, sessions, conversation, advance: (ms: number) => { now += ms; }, revoke: () => { authorized = false; } };
}

describe('local message vault', () => {
  it('searches message contents using SQLite FTS, Unicode and safe literal queries', async () => {
    const f = await fixture();
    const a = await f.conversation('alice', 'Änderungen an der Übertragung prüfen');
    await f.conversation('bob', 'Übertragung PRIVATE_BOB');
    const result = await f.vault.search(f.content.listSessions({ userId: 'alice' }), 'Übertragung');
    expect(result).toMatchObject({ engine: 'sqlite-fts5', total: 1, scannedMessages: 2 });
    expect(result.data[0]).toMatchObject({ sessionId: a.id, messageId: a.messages[0].id, role: 'user' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BOB');
    expect((await f.vault.search([a], '" OR PRIVATE_BOB')).total).toBe(0);
    expect(readdirSync(f.directory)).toEqual([]);
    await expect(f.vault.search([a], 'x', 'unknown')).rejects.toThrow();
  });

  it('projects only authorized messages for native tgrep and removes all temporary files', async () => {
    const f = await fixture(); const a = await f.conversation('alice', 'needle-42');
    await f.conversation('bob', 'PRIVATE_BOB');
    vi.mocked(runLocalTool).mockImplementation(async (_binary, args, cwd) => {
      expect(args).toContain('--index-path');
      expect(readdirSync(cwd).filter(n => n.endsWith('.txt'))).toHaveLength(2);
      const file = readdirSync(cwd).find(n => readFileSync(join(cwd, n), 'utf8').includes('needle-42'))!;
      for (const name of readdirSync(cwd)) expect(readFileSync(join(cwd, name), 'utf8')).not.toContain('PRIVATE_BOB');
      return { exitCode: 0, stdout: JSON.stringify({ type: 'match', data: { path: { text: file }, line_number: 1 } }) };
    });
    const result = await f.vault.search([a], 'needle-\\d+', 'regex');
    expect(result).toMatchObject({ engine: 'tgrep', total: 1 });
    expect(result.data[0].snippet).toBe('needle-42'); expect(readdirSync(f.directory)).toEqual([]);
    vi.mocked(runLocalTool).mockRejectedValue(new Error('tool failed'));
    await expect(f.vault.search([a], '[', 'regex')).rejects.toThrow();
    expect(readdirSync(f.directory)).toEqual([]);
  });

  it('repeats local scans after the saved interval and deduplicates evidence-backed drafts', async () => {
    const f = await fixture(); await f.conversation('alice', 'Please test this change');
    await f.vault.settings('alice', 'credential-v1');
    await f.vault.tick(); expect(f.analyze).not.toHaveBeenCalled();
    f.advance(3600_001); await f.vault.tick();
    expect(f.analyze).toHaveBeenCalledTimes(1);
    expect(f.analyze.mock.calls[0][0]).toBe('alice');
    const suggestions = f.vault.suggestions('alice', f.content.listSessions({ userId: 'alice' }));
    expect(suggestions).toHaveLength(1); expect(suggestions[0].sources).toHaveLength(2);
    expect(f.store.list('platform.prompts')).toEqual([]);
    f.advance(3600_001); await f.vault.tick(); expect(f.analyze).toHaveBeenCalledTimes(2);
    expect(f.vault.suggestions('alice', f.content.listSessions())).toHaveLength(1);
    await f.vault.dismiss('alice', suggestions[0].id);
    await f.vault.scan('alice', 'credential-v1'); expect(f.vault.suggestions('alice', f.content.listSessions())).toHaveLength(0);
    const reloaded = new PlatformVaultService(f.store, { directory: f.directory, sessions: f.sessions, analyze: f.analyze }); services.push(reloaded);
    expect((await reloaded.settings('alice', 'credential-v1')).intervalMinutes).toBe(60);
  });

  it('advances bounded scan batches through the entire history', async () => {
    const f = await fixture(); for (let i = 0; i < 5; i++) await f.conversation('alice', 'Question ' + i);
    f.analyze.mockResolvedValue('{"suggestions":[]}');
    await f.vault.scan('alice', 'v1');
    expect((await f.vault.settings('alice', 'v1')).scannedMessages).toBe(6);
    expect((await f.vault.settings('alice', 'v1')).cursor).toBeTruthy();
    await f.vault.scan('alice', 'v1');
    expect((await f.vault.settings('alice', 'v1')).scannedMessages).toBe(4);
    expect((await f.vault.settings('alice', 'v1')).cursor).toBeUndefined();
  });

  it('refuses invented sources, hides deleted evidence and rechecks authorization after inference', async () => {
    const f = await fixture(); const s = await f.conversation('alice', 'Test this');
    f.analyze.mockResolvedValueOnce('{"suggestions":[{"title":"bad","reason":"bad","prompt":"bad","sources":[99]}]}');
    await expect(f.vault.scan('alice', 'v1')).rejects.toThrow('invalid suggestion');
    expect(f.vault.suggestions('alice', [s])).toHaveLength(0);
    await f.vault.scan('alice', 'v1'); expect(f.vault.suggestions('alice', [s])).toHaveLength(1);
    await f.content.deleteSession(s.id); expect(f.vault.suggestions('alice', f.content.listSessions())).toHaveLength(0);
    await f.conversation('alice', 'Check this change');
    f.analyze.mockImplementationOnce(async () => { f.revoke(); return '{"suggestions":[]}'; });
    await expect(f.vault.scan('alice', 'v1')).rejects.toThrow('Revoked');
    expect((await f.vault.settings('alice', 'v1')).status).toBe('error');
    await expect(f.vault.dismiss('bob', f.store.list<any>('platform.vault.suggestions')[0].id)).rejects.toMatchObject({ status: 404 });
  });

  it('cancels in-flight inference on stop and respects disabled schedules', async () => {
    const f = await fixture(); await f.conversation('alice', 'Test');
    await f.vault.configure('alice', 'v1', { enabled: false, intervalMinutes: 5 });
    f.advance(300_001); await f.vault.tick(); expect(f.analyze).not.toHaveBeenCalled();
    f.analyze.mockImplementation(() => new Promise(() => {}));
    const running = f.vault.scan('alice', 'v1');
    const failure = expect(running).rejects.toThrow('stopping');
    await vi.waitFor(() => expect(f.analyze).toHaveBeenCalledTimes(1));
    await expect(f.vault.scan('alice', 'v1')).rejects.toMatchObject({ status: 409 });
    await f.vault.stop(); await failure;
    expect(f.vault.busy).toBe(false);
  });
});
