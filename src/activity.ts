import { redactSecrets } from './redact.js';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEvent {
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

  add(level: ActivityLevel, scope: string, message: string): ActivityEvent {
    const event = { id: this._nextId++, time: Date.now(), level, scope, message: redactSecrets(message) };
    this._events.push(event);
    if (this._events.length > 200) this._events.splice(0, this._events.length - 200);
    for (const listener of this._listeners) listener(event);
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
