import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runtimeDir } from './config.js';
import { redactSecrets } from './redact.js';

export interface ModelMetric {
  requests: number;
  successes: number;
  failures: number;
  inFlight: number;
  totalLatencyMs: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastUsedAt: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencySamplesMs: number[];
}

function emptyMetric(): ModelMetric {
  return { requests: 0, successes: 0, failures: 0, inFlight: 0, totalLatencyMs: 0, lastLatencyMs: null, lastError: null, lastUsedAt: null, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencySamplesMs: [] };
}

/** Persistent local request telemetry. It never stores prompt or response content. */
export class MetricsStore {
  private readonly metrics = new Map<string, ModelMetric>();

  constructor(private readonly file = join(runtimeDir(), 'usage.json')) {
    if (!existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, ModelMetric>;
      for (const [model, metric] of Object.entries(saved)) {
        if (metric && typeof metric.requests === 'number') this.metrics.set(model, { ...emptyMetric(), ...metric, inFlight: 0 });
      }
    } catch { /* corrupt usage data must never block startup */ }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.metrics), null, 2), { mode: 0o600 });
    renameSync(temporary, this.file);
  }

  begin(model: string): (error?: unknown) => void {
    const metric = this.metrics.get(model) ?? emptyMetric();
    metric.requests += 1;
    metric.inFlight += 1;
    this.metrics.set(model, metric);
    const started = Date.now();
    let finished = false;
    return (error?: unknown) => {
      if (finished) return;
      finished = true;
      metric.inFlight = Math.max(0, metric.inFlight - 1);
      const latency = Date.now() - started;
      metric.lastLatencyMs = latency;
      metric.totalLatencyMs += latency;
      metric.latencySamplesMs = [...metric.latencySamplesMs, latency].slice(-200);
      metric.lastUsedAt = Date.now();
      if (error) {
        metric.failures += 1;
        metric.lastError = redactSecrets(error instanceof Error ? error.message : String(error));
      } else {
        metric.successes += 1;
        metric.lastError = null;
      }
      this.persist();
    };
  }

  recordUsage(model: string, inputTokens: number, outputTokens: number, estimatedCostUsd: number): void {
    const metric = this.metrics.get(model) ?? emptyMetric();
    metric.inputTokens += Math.max(0, Math.round(inputTokens));
    metric.outputTokens += Math.max(0, Math.round(outputTokens));
    metric.estimatedCostUsd += Math.max(0, estimatedCostUsd);
    this.metrics.set(model, metric);
    this.persist();
  }

  snapshot(): Record<string, ModelMetric & { averageLatencyMs: number | null; p50LatencyMs: number | null; p95LatencyMs: number | null; usageSource: 'estimated'; latencySampleCount: number }> {
    const percentile = (samples: number[], percent: number) => {
      if (!samples.length) return null;
      const sorted = [...samples].sort((a, b) => a - b);
      return sorted[Math.max(0, Math.ceil(percent * sorted.length) - 1)];
    };
    return Object.fromEntries([...this.metrics.entries()].map(([model, metric]) => [model, {
      ...metric,
      latencySamplesMs: [...metric.latencySamplesMs],
      averageLatencyMs: metric.successes + metric.failures ? Math.round(metric.totalLatencyMs / (metric.successes + metric.failures)) : null,
      p50LatencyMs: percentile(metric.latencySamplesMs, 0.5),
      p95LatencyMs: percentile(metric.latencySamplesMs, 0.95),
      latencySampleCount: metric.latencySamplesMs.length,
      usageSource: 'estimated' as const,
    }]));
  }
}
