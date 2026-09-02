import { describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MetricsStore } from '../src/metrics.js';

describe('MetricsStore', () => {
  it('tracks successful and failed requests without content', () => {
    const store = new MetricsStore('/tmp/conduit-test-metrics-' + Date.now() + '.json');
    const success = store.begin('cli-claude/first-account/claude-sonnet-5');
    expect(store.snapshot()['cli-claude/first-account/claude-sonnet-5'].inFlight).toBe(1);
    success();
    const failure = store.begin('cli-claude/first-account/claude-sonnet-5');
    failure(new Error('Bearer secret-value failed'));
    const metric = store.snapshot()['cli-claude/first-account/claude-sonnet-5'];
    expect(metric.requests).toBe(2);
    expect(metric.successes).toBe(1);
    expect(metric.failures).toBe(1);
    expect(metric.inFlight).toBe(0);
    expect(metric.lastError).toContain('[redacted]');
    expect(metric.lastError).not.toContain('secret-value');
  });

  it('persists usage.json under CONDUIT_HOME', () => {
    const dir = join(tmpdir(), 'conduit-metrics-home-' + Date.now());
    const previous = process.env.CONDUIT_HOME;
    process.env.CONDUIT_HOME = dir;
    try {
      const store = new MetricsStore();
      store.begin('cli-grok/grok-4.5')();
      expect(existsSync(join(dir, 'usage.json'))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CONDUIT_HOME;
      else process.env.CONDUIT_HOME = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
