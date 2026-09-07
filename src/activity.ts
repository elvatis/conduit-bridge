import { redactSecrets } from './redact.js';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityContext {
  traceId?: string;
  runId?: string;
  stepId?: string;
  provider?: string;
  model?: string;
  status?: string;
  attempt?: number;
  durationMs?: number;
}

export interface ActivityEvent extends ActivityContext {
  id: number;
  time: number;
  level: ActivityLevel;
  scope: string;
  message: string;
}

/** Bounded in-memory operational journal. It never stores prompts, responses, or credentials. */
export class ActivityLog {
  private readonly _events: ActivityEvent[] = [];
  private readonly _listeners = new Set<(event: ActivityEvent) => void>();
  private _nextId = 1;

  add(level: ActivityLevel, scope: string, message: string, context: ActivityContext = {}): ActivityEvent {
    const metadata: ActivityContext = {};
    for (const key of ['traceId', 'runId', 'stepId', 'provider', 'model', 'status'] as const) {
      if (typeof context[key] === 'string') metadata[key] = redactSecrets(context[key]);
    }
    for (const key of ['attempt', 'durationMs'] as const) {
      const value = context[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) metadata[key] = value;
    }
    const event: ActivityEvent = Object.freeze({
      id: this._nextId++, time: Date.now(), level,
      scope: redactSecrets(scope), message: redactSecrets(message), ...metadata,
    });
    this._events.push(event);
    if (this._events.length > 200) this._events.splice(0, this._events.length - 200);
    for (const listener of this._listeners) {
      try { listener(event); } catch { /* a disconnected observer must not fail a request */ }
    }
    return event;
  }

  subscribe(listener: (event: ActivityEvent) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  snapshot(limit = 100): ActivityEvent[] {
    return this._events.slice(-Math.max(1, Math.min(limit, 200))).reverse();
  }
}
