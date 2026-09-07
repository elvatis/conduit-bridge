import { chmodSync, mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export interface StateTransaction {
  read<T>(collection: string, id: string): T | undefined;
  list<T>(collection: string): T[];
  put<T>(collection: string, id: string, value: T): void;
  delete(collection: string, id: string): boolean;
}

/** Hydrated reads; mutations are serialized and acknowledged only after durable commit. */
export interface StateStore {
  ready(): Promise<void>;
  read<T>(collection: string, id: string): T | undefined;
  list<T>(collection: string): T[];
  transaction<T>(operation: (tx: StateTransaction) => T): Promise<T>;
}

export interface StateSnapshot {
  schemaVersion: 1;
  revision: number;
  collections: Record<string, Record<string, unknown>>;
}

export interface SnapshotBackend {
  readonly kind: string;
  load(): Promise<StateSnapshot | undefined>;
  commit(snapshot: StateSnapshot, expectedRevision: number): Promise<void>;
  close?(): Promise<void>;
}

export interface SnapshotCodec { seal(text: string, purpose?: string): string; open(text: string, purpose?: string): string }
const PURPOSE = 'conduit-platform-state-v1';
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const keyPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,199}$/;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

function key(value: string): void {
  if (typeof value !== 'string' || !keyPattern.test(value) || forbiddenKeys.has(value)) throw new Error('Invalid storage key');
}

export function validateSnapshot(value: unknown): StateSnapshot {
  const s = value as StateSnapshot;
  if (!s || s.schemaVersion !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || !s.collections || typeof s.collections !== 'object' || Array.isArray(s.collections)) throw new Error('Unsupported or invalid platform storage schema');
  if (Buffer.byteLength(JSON.stringify(s)) > MAX_SNAPSHOT_BYTES) throw new Error('Platform storage exceeds the size limit; export or remove old content');
  for (const [collection, entries] of Object.entries(s.collections)) {
    key(collection);
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid storage collection');
    for (const id of Object.keys(entries)) key(id);
  }
  return structuredClone(s);
}

function empty(): StateSnapshot { return { schemaVersion: 1, revision: 0, collections: {} }; }
function validateCommit(snapshot: StateSnapshot, expectedRevision: number): StateSnapshot {
  const validated = validateSnapshot(snapshot);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || validated.revision !== expectedRevision + 1) {
    throw new Error('Storage commit revision must advance exactly once');
  }
  return validated;
}
function encode(snapshot: StateSnapshot, codec: SnapshotCodec): string { return codec.seal(JSON.stringify(validateSnapshot(snapshot)), PURPOSE); }
function decode(text: string, codec: SnapshotCodec): StateSnapshot {
  if (Buffer.byteLength(text) > MAX_SNAPSHOT_BYTES * 2) throw new Error('Platform storage envelope exceeds the size limit');
  return validateSnapshot(JSON.parse(codec.open(text, PURPOSE)));
}

export class StorageConflictError extends Error {
  readonly status = 409;
  constructor() { super('Storage changed in another process; reload the record and retry'); }
}

export class TransactionalStateStore implements StateStore {
  private snapshot = empty();
  private initialization: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(readonly backend: SnapshotBackend) {
    this.initialization = backend.load().then(s => { this.snapshot = s ? validateSnapshot(s) : empty(); });
    // The caller still receives the error through ready(); avoid an unhandled startup rejection.
    void this.initialization.catch(() => {});
  }
  ready(): Promise<void> { return this.initialization; }
  get revision(): number { return this.snapshot.revision; }
  read<T>(collection: string, id: string): T | undefined {
    key(collection); key(id);
    const entries = this.snapshot.collections[collection];
    return entries && Object.hasOwn(entries, id) ? structuredClone(entries[id]) as T : undefined;
  }
  list<T>(collection: string): T[] { key(collection); return structuredClone(Object.values(this.snapshot.collections[collection] ?? {})) as T[]; }
  transaction<T>(operation: (tx: StateTransaction) => T): Promise<T> {
    const work = this.tail.then(async () => {
      await this.ready();
      if (this.closed) throw new Error('Platform storage is closed');
      const draft = structuredClone(this.snapshot);
      let active = true;
      const assertActive = () => { if (!active) throw new Error('Storage transaction is no longer active'); };
      const tx: StateTransaction = {
        read: <V>(collection: string, id: string) => {
          assertActive();
          key(collection); key(id); const entries = draft.collections[collection];
          return entries && Object.hasOwn(entries, id) ? structuredClone(entries[id]) as V : undefined;
        },
        list: <V>(collection: string) => { assertActive(); key(collection); return structuredClone(Object.values(draft.collections[collection] ?? {})) as V[]; },
        put: (collection, id, value) => {
          assertActive();
          key(collection); key(id);
          // JSON is the portable contract across all adapters, not arbitrary JS objects.
          const portable = JSON.parse(JSON.stringify(value));
          const entries = draft.collections[collection] ??= {};
          entries[id] = portable;
        },
        delete: (collection, id) => { assertActive(); key(collection); key(id); const entries = draft.collections[collection]; if (!entries || !Object.hasOwn(entries, id)) return false; delete entries[id]; return true; },
      };
      let result: T;
      try { result = operation(tx); }
      finally { active = false; }
      if (result && typeof (result as { then?: unknown }).then === 'function') throw new Error('Storage transaction callbacks must be synchronous');
      draft.revision += 1;
      const committed = validateSnapshot(draft);
      try { await this.backend.commit(committed, this.snapshot.revision); }
      catch (error) {
        if (error instanceof StorageConflictError) { const current = await this.backend.load(); if (current) this.snapshot = validateSnapshot(current); }
        throw error;
      }
      // Never retain the object captured by the transaction closure.
      this.snapshot = committed;
      return structuredClone(result);
    });
    this.tail = work.catch(() => {});
    return work;
  }
  /** Encrypted, portable backup; backend/ORM selection does not change the export format. */
  async backup(codec: SnapshotCodec): Promise<{ format: 'conduit-platform-backup-v1'; data: string }> {
    await this.ready(); await this.tail;
    return { format: 'conduit-platform-backup-v1', data: encode(this.snapshot, codec) };
  }
  async restore(backup: { format: string; data: string }, codec: SnapshotCodec): Promise<void> {
    if (backup?.format !== 'conduit-platform-backup-v1') throw new Error('Unsupported backup format');
    const imported = decode(backup.data, codec);
    await this.transaction(tx => {
      for (const [collection, entries] of Object.entries(this.snapshot.collections)) for (const id of Object.keys(entries)) tx.delete(collection, id);
      for (const [collection, entries] of Object.entries(imported.collections)) for (const [id, value] of Object.entries(entries)) tx.put(collection, id, value);
    });
  }
  async close(): Promise<void> { await this.tail; this.closed = true; await this.backend.close?.(); }
}

/** Explicitly volatile adapter for ephemeral installations and adapter contract tests. */
export class MemorySnapshotBackend implements SnapshotBackend {
  readonly kind = 'memory';
  private snapshot?: StateSnapshot;
  async load(): Promise<StateSnapshot | undefined> { return this.snapshot ? structuredClone(this.snapshot) : undefined; }
  async commit(snapshot: StateSnapshot, expectedRevision: number): Promise<void> {
    snapshot = validateCommit(snapshot, expectedRevision);
    if ((this.snapshot?.revision ?? 0) !== expectedRevision) throw new StorageConflictError();
    this.snapshot = validateSnapshot(snapshot);
  }
}

/** Encrypted atomic-file adapter. The short-lived lock protects compare-and-swap across processes. */
export class FileSnapshotBackend implements SnapshotBackend {
  readonly kind = 'file';
  readonly file: string;
  constructor(file: string, private codec: SnapshotCodec) { this.file = resolve(file); }
  async load(): Promise<StateSnapshot | undefined> {
    if (!existsSync(this.file)) return undefined;
    if (statSync(this.file).size > MAX_SNAPSHOT_BYTES * 2) throw new Error('Platform storage envelope exceeds the size limit');
    return decode(readFileSync(this.file, 'utf8'), this.codec);
  }
  async commit(snapshot: StateSnapshot, expectedRevision: number): Promise<void> {
    snapshot = validateCommit(snapshot, expectedRevision);
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const lock = `${this.file}.lock`;
    const owner = randomUUID();
    let handle: number;
    try { handle = openSync(lock, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // A dead process cannot retain its lease. Refuse unknown/corrupt lock owners.
      let previous: { pid: number; owner: string };
      try {
        if (statSync(lock).size > 4096) throw new Error('oversized lock');
        previous = JSON.parse(readFileSync(lock, 'utf8'));
      } catch { throw new Error('Platform storage is locked; inspect its lock file before recovery'); }
      if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw new Error('Invalid platform storage lock');
      try { process.kill(previous.pid, 0); throw new StorageConflictError(); }
      catch (probe) { if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe; }
      // Recheck the lease before deleting to avoid removing a replacement owner.
      if (readFileSync(lock, 'utf8') !== JSON.stringify(previous)) throw new StorageConflictError();
      unlinkSync(lock);
      try { handle = openSync(lock, 'wx', 0o600); } catch { throw new StorageConflictError(); }
    }
    const temporary = `${this.file}.${owner}.tmp`;
    try {
      writeFileSync(handle, JSON.stringify({ pid: process.pid, owner }));
      const current = await this.load();
      if ((current?.revision ?? 0) !== expectedRevision) throw new StorageConflictError();
      writeFileSync(temporary, encode(snapshot, this.codec), { mode: 0o600, flush: true, flag: 'wx' });
      renameSync(temporary, this.file);
      chmodSync(this.file, 0o600);
    } finally {
      closeSync(handle);
      if (existsSync(temporary)) unlinkSync(temporary);
      try { if (JSON.parse(readFileSync(lock, 'utf8')).owner === owner) unlinkSync(lock); } catch { /* never remove a different owner's lock */ }
    }
  }
}

/** Encrypted local SQLite state, with a one-time import of the legacy file. */
export class SqliteSnapshotBackend implements SnapshotBackend {
  readonly kind = 'sqlite';
  private database: import('node:sqlite').DatabaseSync;
  constructor(file: string, private codec: SnapshotCodec, private legacyFile?: string) {
    mkdirSync(dirname(resolve(file)), { recursive: true, mode: 0o700 });
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    this.database = new DatabaseSync(resolve(file));
    chmodSync(resolve(file), 0o600);
    this.database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS bridge_state (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)');
  }
  async load(): Promise<StateSnapshot | undefined> {
    let row = this.database.prepare('SELECT payload FROM bridge_state WHERE id = ?').get('platform') as { payload: string } | undefined;
    if (!row && this.legacyFile && existsSync(this.legacyFile)) {
      const legacy = await new FileSnapshotBackend(this.legacyFile, this.codec).load();
      if (legacy) {
        // Preserve the source file and revision. Another process may have imported first.
        this.database.prepare('INSERT OR IGNORE INTO bridge_state (id, revision, payload) VALUES (?, ?, ?)').run('platform', legacy.revision, encode(legacy, this.codec));
        row = this.database.prepare('SELECT payload FROM bridge_state WHERE id = ?').get('platform') as { payload: string };
      }
    }
    return row ? decode(row.payload, this.codec) : undefined;
  }
  async commit(snapshot: StateSnapshot, expectedRevision: number): Promise<void> {
    snapshot = validateCommit(snapshot, expectedRevision);
    const payload = encode(snapshot, this.codec);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const row = this.database.prepare('SELECT revision FROM bridge_state WHERE id = ?').get('platform') as { revision: number } | undefined;
      if ((row?.revision ?? 0) !== expectedRevision) throw new StorageConflictError();
      this.database.prepare('INSERT INTO bridge_state (id, revision, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload').run('platform', snapshot.revision, payload);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  async close(): Promise<void> { this.database.close(); }
}

/** Structural interface permits generated Prisma clients without coupling the bridge package to Prisma. */
export interface PrismaStateClient {
  bridgeState: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; revision: number; payload: string } | null>;
    create(args: { data: { id: string; revision: number; payload: string } }): Promise<unknown>;
    updateMany(args: { where: { id: string; revision: number }; data: { revision: number; payload: string } }): Promise<{ count: number }>;
  };
}

export class PrismaSnapshotBackend implements SnapshotBackend {
  readonly kind = 'prisma';
  constructor(private client: PrismaStateClient, private codec: SnapshotCodec) {}
  async load(): Promise<StateSnapshot | undefined> {
    const row = await this.client.bridgeState.findUnique({ where: { id: 'platform' } });
    return row ? decode(row.payload, this.codec) : undefined;
  }
  async commit(snapshot: StateSnapshot, expectedRevision: number): Promise<void> {
    snapshot = validateCommit(snapshot, expectedRevision);
    const data = { revision: snapshot.revision, payload: encode(snapshot, this.codec) };
    if (expectedRevision === 0) {
      try { await this.client.bridgeState.create({ data: { id: 'platform', ...data } }); }
      catch (error) { if ((error as { code?: string }).code === 'P2002') throw new StorageConflictError(); throw error; }
    } else {
      const result = await this.client.bridgeState.updateMany({ where: { id: 'platform', revision: expectedRevision }, data });
      if (result.count !== 1) throw new StorageConflictError();
    }
  }
}
