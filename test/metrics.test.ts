import { describe, expect, it } from 'vitest';
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
});
