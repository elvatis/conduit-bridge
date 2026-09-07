import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { TransactionalStateStore, MemorySnapshotBackend, FileSnapshotBackend, SqliteSnapshotBackend, PrismaSnapshotBackend, StorageConflictError, type SnapshotCodec, type PrismaStateClient, type StateTransaction } from '../src/storage.js';

const directories: string[] = [];
const stores: TransactionalStateStore[] = [];
const encryptionKey = randomBytes(32);
const codec: SnapshotCodec = {
  seal(value, purpose = '') {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv); cipher.setAAD(Buffer.from(purpose));
    const payload = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64');
  },
  open(value, purpose = '') {
    const bytes = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28)); cipher.setAAD(Buffer.from(purpose));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString();
  },
};
function file(name: string): string { const dir = mkdtempSync(join(tmpdir(), 'conduit-storage-')); directories.push(dir); return join(dir, name); }
function store(backend = new MemorySnapshotBackend()): TransactionalStateStore { const s = new TransactionalStateStore(backend); stores.push(s); return s; }
afterEach(async () => { await Promise.all(stores.splice(0).map(s => s.close())); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('transactional platform storage', () => {
  it('serializes concurrent mutations, clones reads, and rolls back failures', async () => {
    const s = store(); await s.ready();
    await s.transaction(tx => tx.put('counter', 'a', { value: 0 }));
    await Promise.all(Array.from({ length: 20 }, () => s.transaction(tx => { const row = tx.read<{ value: number }>('counter', 'a')!; tx.put('counter', 'a', { value: row.value + 1 }); })));
    const row = s.read<{ value: number }>('counter', 'a')!; row.value = 999;
    expect(s.read('counter', 'a')).toEqual({ value: 20 });
    await expect(s.transaction(tx => { tx.put('counter', 'a', { value: -1 }); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(s.read('counter', 'a')).toEqual({ value: 20 });
    await expect(s.transaction(tx => tx.put('__proto__', 'a', {}))).rejects.toThrow('Invalid storage key');
  });

  it('does not acknowledge or expose a mutation whose durable commit fails', async () => {
    const backend = new MemorySnapshotBackend(); const s = store(backend); await s.ready();
    backend.commit = async () => { throw new Error('disk full'); };
    await expect(s.transaction(tx => tx.put('messages', 'a', { content: 'private' }))).rejects.toThrow('disk full');
    expect(s.list('messages')).toEqual([]);
  });

  it('requires every backend commit revision to advance exactly once', async () => {
    const backend = new MemorySnapshotBackend();
    await expect(backend.commit({ schemaVersion: 1, revision: 2, collections: {} }, 0))
      .rejects.toThrow(/advance exactly once/i);
  });

  it('invalidates a captured transaction so it cannot mutate committed memory', async () => {
    const s = store(); await s.ready();
    let captured: StateTransaction | undefined;
    await s.transaction(tx => { captured = tx; tx.put('messages', 'safe', { value: 1 }); });
    expect(() => captured!.put('messages', 'late', { value: 2 })).toThrow(/no longer active/i);
    expect(s.read('messages', 'late')).toBeUndefined();
    expect(s.read('messages', 'safe')).toEqual({ value: 1 });
  });

  it('persists encrypted snapshots and detects stale writers before replacing data', async () => {
    const path = file('platform.enc');
    const a = new TransactionalStateStore(new FileSnapshotBackend(path, codec)); stores.push(a);
    const b = new TransactionalStateStore(new FileSnapshotBackend(path, codec)); stores.push(b);
    await Promise.all([a.ready(), b.ready()]);
    await a.transaction(tx => tx.put('messages', 'a', { content: 'PRIVATE_TRANSCRIPT' }));
    expect(readFileSync(path, 'utf8')).not.toContain('PRIVATE_TRANSCRIPT');
    await expect(b.transaction(tx => tx.put('messages', 'b', { content: 'second' }))).rejects.toBeInstanceOf(StorageConflictError);
    expect(b.list('messages')).toEqual([{ content: 'PRIVATE_TRANSCRIPT' }]);
    await b.transaction(tx => tx.put('messages', 'b', { content: 'second' }));
    const recovered = new TransactionalStateStore(new FileSnapshotBackend(path, codec)); stores.push(recovered); await recovered.ready();
    expect(recovered.list('messages')).toHaveLength(2);
  });

  it('rejects corrupted encrypted state and imports a portable encrypted backup atomically', async () => {
    const original = store(); await original.ready(); await original.transaction(tx => tx.put('skills', 'review', { version: 1 }));
    const backup = await original.backup(codec); expect(backup.data).not.toContain('review');
    const restored = store(); await restored.ready(); await restored.restore(backup, codec); expect(restored.read('skills', 'review')).toEqual({ version: 1 });
    const path = file('corrupt.enc'); writeFileSync(path, 'damaged');
    const corrupt = new TransactionalStateStore(new FileSnapshotBackend(path, codec)); stores.push(corrupt);
    await expect(corrupt.ready()).rejects.toThrow();
    await expect(restored.restore({ ...backup, data: 'damaged' }, codec)).rejects.toThrow();
    expect(restored.read('skills', 'review')).toEqual({ version: 1 });
  });

  it('runs the same persistence and CAS contract on native SQLite', async () => {
    const path = file('platform.sqlite');
    const a = new TransactionalStateStore(new SqliteSnapshotBackend(path, codec)); stores.push(a);
    const b = new TransactionalStateStore(new SqliteSnapshotBackend(path, codec)); stores.push(b);
    await Promise.all([a.ready(), b.ready()]);
    await a.transaction(tx => tx.put('agents', 'reviewer', { instructions: 'PRIVATE_AGENT' }));
    await expect(b.transaction(tx => tx.put('agents', 'writer', {}))).rejects.toBeInstanceOf(StorageConflictError);
    await b.transaction(tx => tx.put('agents', 'writer', {}));
    expect(b.list('agents')).toHaveLength(2);
    expect(readFileSync(path).includes(Buffer.from('PRIVATE_AGENT'))).toBe(false);
  });

  it('imports the encrypted legacy file once into SQLite without replacing newer database content', async () => {
    const path = file('legacy.enc');
    const source = new TransactionalStateStore(new FileSnapshotBackend(path, codec)); stores.push(source); await source.ready();
    await source.transaction(tx => tx.put('messages', 'legacy', { content: 'PRIVATE_OLD_CONVERSATION' }));
    const bytes = readFileSync(path);
    const database = path + '.sqlite';
    const migrated = new TransactionalStateStore(new SqliteSnapshotBackend(database, codec, path)); stores.push(migrated); await migrated.ready();
    expect(migrated.revision).toBe(source.revision);
    expect(migrated.read('messages', 'legacy')).toEqual({ content: 'PRIVATE_OLD_CONVERSATION' });
    await migrated.transaction(tx => tx.put('messages', 'new', { content: 'PRIVATE_NEW_CONVERSATION' }));
    const reopened = new TransactionalStateStore(new SqliteSnapshotBackend(database, codec, path)); stores.push(reopened); await reopened.ready();
    expect(reopened.list('messages')).toHaveLength(2);
    expect(readFileSync(path)).toEqual(bytes);
    expect(readFileSync(database).includes(Buffer.from('PRIVATE_OLD_CONVERSATION'))).toBe(false);
  });

  it('uses conditional Prisma writes and propagates actual database failures', async () => {
    let row: { id: string; revision: number; payload: string } | null = null;
    const client: PrismaStateClient = { bridgeState: {
      async findUnique() { return row ? { ...row } : null; },
      async create({ data }) { if (row) throw Object.assign(new Error('duplicate'), { code: 'P2002' }); row = { ...data }; },
      async updateMany({ where, data }) { if (!row || row.revision !== where.revision) return { count: 0 }; row = { ...row, ...data }; return { count: 1 }; },
    } };
    const a = new TransactionalStateStore(new PrismaSnapshotBackend(client, codec)); stores.push(a);
    const b = new TransactionalStateStore(new PrismaSnapshotBackend(client, codec)); stores.push(b);
    await Promise.all([a.ready(), b.ready()]);
    await a.transaction(tx => tx.put('profiles', 'local', { model: 'example' }));
    await expect(b.transaction(tx => tx.put('profiles', 'other', {}))).rejects.toBeInstanceOf(StorageConflictError);
    expect(b.read('profiles', 'local')).toEqual({ model: 'example' });
    client.bridgeState.updateMany = async () => { throw new Error('database unavailable'); };
    await expect(a.transaction(tx => tx.delete('profiles', 'local'))).rejects.toThrow('database unavailable');
    expect(a.read('profiles', 'local')).toBeDefined();
  });
});
