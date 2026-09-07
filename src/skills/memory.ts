import { createHash } from 'node:crypto';
import { requirePlatformCapability } from '../platform-auth.js';
import { SkillError, type SkillDefinition, type SkillExecutionContext } from './index.js';

const COLLECTION = 'skills.memory';
const MAX_VALUE_BYTES = 16 * 1024;
const MAX_ENTRIES = 100;
type Scope = 'user' | 'workspace';
interface MemoryEntry {
  scope: Scope;
  scopeId: string;
  key: string;
  value: unknown;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

function conflict(): SkillError {
  return new SkillError('Memory changed; read its current revision before updating or deleting', 409);
}
function scopeFor(input: Record<string, unknown>, context: SkillExecutionContext, writing: boolean): { scope: Scope; scopeId: string } {
  const scope = input.scope ?? 'user';
  if (scope !== 'user' && scope !== 'workspace') throw new SkillError('Memory scope must be user or workspace');
  const scopeId = scope === 'user' ? context.operator.operatorId : context.workspace?.id;
  if (typeof scopeId !== 'string' || !scopeId || scopeId.length > 300) throw new SkillError('Memory requires an authenticated owner or an authorized workspace');
  requirePlatformCapability(context.operator, writing ? 'operate' : 'view', scope === 'workspace' ? scopeId : undefined);
  return { scope, scopeId };
}
function jsonValue(value: unknown): unknown {
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (depth > 20) throw new SkillError('Memory JSON is too deeply nested');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) throw new SkillError('Memory value must contain only JSON values');
    if (seen.has(item)) throw new SkillError('Memory value must not contain cycles');
    seen.add(item);
    for (const part of Object.values(item)) visit(part, depth + 1);
    seen.delete(item);
  };
  visit(value, 0);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_VALUE_BYTES) throw new SkillError('Memory value exceeds 16 KiB');
  return JSON.parse(encoded);
}

/** Scoped JSON scratch memory in the platform store; it never approves or attaches conversation facts. */
export const memorySkill: SkillDefinition = {
  name: 'memory',
  description: 'Get, set, list or delete scoped JSON values in the configured platform store. User scope is the authenticated operator; workspace scope is the authorized execution workspace. This separate key/value namespace does not approve or automatically attach reviewed conversation memory.',
  schema: {
    type: 'object', additionalProperties: false, required: ['action'],
    properties: {
      action: { type: 'string', enum: ['get', 'set', 'list', 'delete'] },
      scope: { type: 'string', enum: ['user', 'workspace'], description: 'Defaults to user; the scope identity always comes from execution context.' },
      key: { type: 'string', maxLength: 100 },
      value: { description: 'JSON value, at most 16 KiB. Required for set.' },
      expectedRevision: { type: 'integer', minimum: 0, description: 'Current revision required when replacing/deleting an existing entry; zero means create only.' },
    },
  },
  effect: input => input.action === 'get' || input.action === 'list' ? 'read' : 'write',
  async execute(input, context) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SkillError('Memory input must be an object');
    if (Object.keys(input).some(key => !['action', 'scope', 'key', 'value', 'expectedRevision'].includes(key))) throw new SkillError('Unknown memory input field');
    if (!['get', 'set', 'list', 'delete'].includes(input.action as string)) throw new SkillError('Select get, set, list or delete');
    const writing = input.action === 'set' || input.action === 'delete';
    const selected = scopeFor(input, context, writing);
    if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0)) throw new SkillError('expectedRevision must be a nonnegative integer');
    if (input.action !== 'list' && (typeof input.key !== 'string' || !input.key.trim() || input.key.length > 100 || /[\0\r\n]/.test(input.key))) throw new SkillError('key must be nonempty text of at most 100 characters without control lines');
    if (input.action !== 'set' && Object.hasOwn(input, 'value')) throw new SkillError('value is only accepted for set');
    const value = input.action === 'set' ? jsonValue(input.value) : undefined;
    context.signal.throwIfAborted();
    await context.store.ready();
    context.signal.throwIfAborted();
    const matches = (entry: MemoryEntry) => entry.scope === selected.scope && entry.scopeId === selected.scopeId;
    if (input.action === 'list') {
      const entries = context.store.list<MemoryEntry>(COLLECTION).filter(matches).sort((a, b) => a.key.localeCompare(b.key));
      return { ...selected, entries: entries.map(({ key, revision, createdAt, updatedAt }) => ({ key, revision, createdAt, updatedAt })) };
    }
    const key = input.key as string;
    const id = createHash('sha256').update(JSON.stringify([selected.scope, selected.scopeId, key])).digest('hex');
    if (input.action === 'get') {
      const entry = context.store.read<MemoryEntry>(COLLECTION, id);
      return { ...selected, key, entry: entry && matches(entry) ? entry : null };
    }
    return context.store.transaction(tx => {
      context.signal.throwIfAborted();
      const previous = tx.read<MemoryEntry>(COLLECTION, id);
      if (previous && (!matches(previous) || previous.key !== key)) throw new SkillError('Memory record scope mismatch');
      if (previous ? input.expectedRevision !== previous.revision : input.expectedRevision !== undefined && input.expectedRevision !== 0) throw conflict();
      if (input.action === 'delete') return { ...selected, key, deleted: tx.delete(COLLECTION, id) };
      if (!previous && tx.list<MemoryEntry>(COLLECTION).filter(matches).length >= MAX_ENTRIES) throw new SkillError('Memory scope has reached its 100 entry limit');
      const now = Date.now();
      const entry: MemoryEntry = { ...selected, key, value, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      tx.put(COLLECTION, id, entry);
      return { entry };
    });
  },
};
