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
}

function emptyMetric(): ModelMetric {
  return { requests: 0, successes: 0, failures: 0, inFlight: 0, totalLatencyMs: 0, lastLatencyMs: null, lastError: null, lastUsedAt: null, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
}

function safeError(message: string): string {
  return message.slice(0, 240).replace(/(Bearer\s+|(?:sk|pplx|xai)-)[A-Za-z0-9._-]+/gi, '$1[redacted]');
}

/** Persistent local request telemetry. It never stores prompt or response content. */
export class MetricsStore {
  private readonly metrics = new Map<string, ModelMetric>();

  constructor(private readonly file = join(homedir(), '.conduit', 'usage.json')) {
    if (!existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, ModelMetric>;
      for (const [model, metric] of Object.entries(saved)) {
        if (metric && typeof metric.requests === 'number') this.metrics.set(model, { ...emptyMetric(), ...metric, inFlight: 0 });
      }
    } catch { /* corrupt usage data must never block startup */ }
  }

  private persist(): void {
    mkdirSync(join(this.file, '..'), { recursive: true });
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.metrics), null, 2), { mode: 0o600 });
    chmodSync(this.file, 0o600);
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
      metric.lastUsedAt = Date.now();
      if (error) {
        metric.failures += 1;
        metric.lastError = safeError(error instanceof Error ? error.message : String(error));
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

  snapshot(): Record<string, ModelMetric & { averageLatencyMs: number | null }> {
    return Object.fromEntries([...this.metrics.entries()].map(([model, metric]) => [model, {
      ...metric,
      averageLatencyMs: metric.requests ? Math.round(metric.totalLatencyMs / metric.requests) : null,
    }]));
  }
}
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
