import { vi } from 'vitest';
import { MemorySnapshotBackend, TransactionalStateStore } from '../../src/storage.js';
import type { SkillExecutionContext } from '../../src/skills/index.js';
import { RateLimiter } from '../../src/rate-limiter.js';
export function skillContext(root: string): SkillExecutionContext {
  return { operator: { operatorId: 'test', role: 'admin', workspaceIds: ['*'], source: 'operator-token', displayName: 'Test' }, workspace: { id: 'ws', root }, signal: new AbortController().signal, store: new TransactionalStateStore(new MemorySnapshotBackend()), authorize: vi.fn(), resolveModel: vi.fn(async (agent, model) => model || (agent === 'lmstudio' || agent === 'bitnet' ? `${agent}/auto` : agent.endsWith('-api') ? `api-${agent.slice(0, -4)}/fixture` : `${agent}/fixture`)), executeModel: vi.fn(async () => 'result'), rateLimiter: new RateLimiter(root) };
}
