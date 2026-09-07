import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RateLimiter } from '../src/rate-limiter.js';
let root: string; let now: number;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-quota-')); now = 100000000; });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('reserves before execution, persists costs and enforces all three rolling windows', () => {
  const config = { 'cli-codex': { perMinute: 1, perHour: 2, perDay: 3, costPerCall: 0.02 } };
  const limiter = new RateLimiter(root, config, () => now);
  const first = limiter.reserve('cli-codex');
  expect(() => limiter.reserve('cli-codex')).toThrow('quota');
  now += 60000; limiter.reserve('cli-codex');
  now += 60000; expect(() => limiter.reserve('cli-codex')).toThrow('quota');
  now += 3600000; limiter.reserve('cli-codex');
  now += 3600000; expect(() => new RateLimiter(root, config, () => now).reserve('cli-codex')).toThrow('quota');
  limiter.recordCost(first.id, 0.1); expect(limiter.summary().totals['cli-codex']).toBeCloseTo(0.14);
  now += 86400000; limiter.reserve('cli-codex'); expect(limiter.summary().calls).toHaveLength(1);
  expect(limiter.summary().totals['cli-codex']).toBeCloseTo(0.16);
});
it('isolates providers and rejects invalid limits and costs', () => {
  const limiter = new RateLimiter(root, { bad: { perMinute: -1, perHour: 0, perDay: 0 } }, () => now);
  limiter.reserve('cli-claude'); expect(limiter.summary().totals).not.toHaveProperty('cli-codex');
  expect(() => limiter.reserve('bad')).toThrow('nonnegative');
  expect(() => limiter.reserve('__proto__')).toThrow('Invalid');
  expect(() => limiter.recordCost('missing', NaN)).toThrow('Invalid');
});
