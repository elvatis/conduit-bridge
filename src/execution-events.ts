import type { ExecutionEvent } from './types.js';
import { redactContentSecrets } from './redact.js';

/** Append/update bounded public evidence; call sites enforce their per-run cap. */
export function recordExecutionEvent(events: ExecutionEvent[], event: ExecutionEvent, acceptNew: boolean): boolean {
  if (typeof event.id !== 'string' || !event.id || event.id.length > 120) return false;
  const index = events.findIndex(item => item.id === event.id && item.kind === event.kind);
  if (index < 0 && !acceptNew) return false;
  const clean = (value: string, limit = 16384) => {
    const redacted = redactContentSecrets(value);
    return redacted.length > limit ? redacted.slice(0, limit) + '\n[truncated]' : redacted;
  };
  let safe: ExecutionEvent;
  if (event.kind === 'command') {
    // Do not show/copy a partial shell command as an executable command.
    if (typeof event.command !== 'string' || event.command.length > 32768) return false;
    safe = { kind: 'command', id: event.id, command: redactContentSecrets(event.command), cwd: event.cwd && clean(event.cwd, 1024), status: event.status, startedAt: event.startedAt, completedAt: event.completedAt, exitCode: event.exitCode, stdout: event.stdout === undefined ? undefined : clean(event.stdout), stderr: event.stderr === undefined ? undefined : clean(event.stderr), combinedOutput: event.combinedOutput === undefined ? undefined : clean(event.combinedOutput) };
  } else if (event.kind === 'message') safe = { kind: 'message', id: event.id, text: clean(event.text, 8192), at: event.at };
  else if (event.kind === 'plan') safe = { kind: 'plan', id: event.id, at: event.at, items: event.items.slice(0, 32).map(item => ({ text: clean(item.text, 200), completed: item.completed })) };
  else return false;
  if (index < 0) events.push(safe); else events[index] = safe;
  return true;
}

/** Codex exec JSONL uses the public SDK's thread item contract:
 * https://github.com/openai/codex/blob/main/sdk/typescript/src/items.ts
 * Only public messages, commands and checklist items are retained. */
export function codexExecutionEvents(emit: (event: ExecutionEvent) => void, cwd?: string, now = Date.now) {
  let pending = '';
  let discarding = false;
  const starts = new Map<string, number>();
  function line(source: string) {
    let frame: any;
    try { frame = JSON.parse(source); } catch { return; }
    const item = frame?.item;
    if (!['item.started', 'item.updated', 'item.completed'].includes(frame?.type) || !item || typeof item.id !== 'string') return;
    const at = now();
    if (item.type === 'command_execution' && typeof item.command === 'string') {
      if (!starts.has(item.id)) { if (starts.size >= 512) return; starts.set(item.id, at); }
      const completed = frame.type === 'item.completed';
      emit({ kind: 'command', id: item.id, command: item.command, cwd, startedAt: starts.get(item.id)!, completedAt: completed ? at : undefined, status: completed ? item.status === 'failed' ? 'failed' : 'completed' : 'running', combinedOutput: typeof item.aggregated_output === 'string' ? item.aggregated_output : '', exitCode: typeof item.exit_code === 'number' ? item.exit_code : undefined });
    } else if (item.type === 'agent_message' && typeof item.text === 'string' && frame.type === 'item.completed') {
      emit({ kind: 'message', id: item.id, text: item.text, at });
    } else if (item.type === 'todo_list' && Array.isArray(item.items)) {
      emit({ kind: 'plan', id: item.id, at, items: item.items.filter((row: any) => typeof row?.text === 'string' && typeof row?.completed === 'boolean').slice(0, 32).map((row: any) => ({ text: row.text, completed: row.completed })) });
    }
  }
  return {
    push(chunk: string) {
      // Bound an incomplete frame even when a provider produces a huge line.
      const parts = chunk.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (!discarding) {
          pending += parts[i];
          if (pending.length > 1_000_000) { pending = ''; discarding = true; }
        }
        if (i < parts.length - 1) { if (!discarding) line(pending); pending = ''; discarding = false; }
      }
    },
    finish() { if (!discarding && pending) line(pending); pending = ''; },
  };
}
