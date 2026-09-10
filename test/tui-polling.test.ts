import { describe, expect, it, vi } from 'vitest';
import { runInteractiveChat, type ChatTurnClient } from '../src/interactive-cli.js';

/**
 * refreshExtras is the only source of run status, cost and the approval card,
 * and all eleven of its call sites sit inside the keyboard loop, which blocks
 * on `await terminal.readKey()`. The only interval that existed moved the
 * spinner frame. So a run that stops and waits for approval could sit unnoticed
 * for as long as the user did not press a key, while being blocked on exactly
 * that approval. The web surface of this repository polls every 2500 ms.
 */

function client(onListRuns: () => void): ChatTurnClient {
  return {
    listModels: async () => [{ id: 'cli-codex/first' }],
    createSession: async model => ({ id: 'session-1', model }),
    listSessions: async () => [],
    getSession: async id => ({ id, title: 't', model: 'cli-codex/first', messages: [] }),
    listRuns: async () => { onListRuns(); return []; },
    gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
    status: async () => ({ version: '0.10.0', providers: [] }),
    send: async () => 'ok',
    cancel: async () => {},
  } as unknown as ChatTurnClient;
}

/** Runs the loop, holds it open for `ticks` poll intervals, then quits. */
async function withPolling(ticks: number): Promise<number> {
  vi.useFakeTimers();
  let polls = 0;
  let release: (() => void) | undefined;
  const keys: Array<{ type: 'ctrl'; key: string }> = [{ type: 'ctrl', key: 'q' }];

  const run = runInteractiveChat({
    client: client(() => { polls += 1; }),
    terminal: {
      columns: 80,
      rows: 24,
      write: () => {},
      // Block until the test has advanced the clock, then quit.
      readKey: async () => {
        await new Promise<void>(resolve => { release = resolve; });
        return keys.shift() ?? null;
      },
    },
  });

  // Let the startup refresh settle before counting poll ticks.
  await vi.advanceTimersByTimeAsync(0);
  const baseline = polls;
  for (let i = 0; i < ticks; i += 1) await vi.advanceTimersByTimeAsync(2500);
  const during = polls - baseline;

  release?.();
  vi.useRealTimers();
  await run;
  return during;
}

describe('run state is refreshed while the keyboard loop is blocked', () => {
  it('polls while nothing is typed, so a pending approval becomes visible', async () => {
    // Without the interval this is 0: the loop is parked on readKey and the only
    // other timer moves the spinner.
    expect(await withPolling(3)).toBeGreaterThan(0);
  });

  it('polls once per interval rather than piling up', async () => {
    const three = await withPolling(3);
    const six = await withPolling(6);
    // Twice the waiting, about twice the polls. An overlapping implementation
    // would grow faster than the elapsed time.
    expect(six).toBeGreaterThan(three);
    expect(six).toBeLessThanOrEqual(three * 2 + 1);
  });

  it('does not start a second poll while the first is still in flight', async () => {
    // refreshExtras makes five requests. With a client that never answers, a
    // guardless implementation starts a fresh set on every tick. The fast
    // client used above can never show this, because its ticks never overlap.
    vi.useFakeTimers();
    let started = 0;
    let release: (() => void) | undefined;
    const slow = {
      listModels: async () => [{ id: 'cli-codex/first' }],
      createSession: async (model: string) => ({ id: 'session-1', model }),
      listSessions: async () => [],
      getSession: async (id: string) => ({ id, title: 't', model: 'cli-codex/first', messages: [] }),
      // Answers the startup refresh, then hangs. Hanging on the first call too
      // would block runInteractiveChat before the loop, so the interval would
      // never be installed and the test would measure nothing.
      listRuns: () => {
        started += 1;
        return started === 1 ? Promise.resolve([]) : new Promise<never>(() => {});
      },
      gitSnapshot: async () => ({ detected: false, branch: '', files: 0, name: '' }),
      status: async () => ({ version: '0.10.0', providers: [] }),
      send: async () => 'ok',
      cancel: async () => {},
    } as unknown as ChatTurnClient;

    const run = runInteractiveChat({
      client: slow,
      terminal: {
        columns: 80,
        rows: 24,
        write: () => {},
        readKey: async () => {
          await new Promise<void>(resolve => { release = resolve; });
          return { type: 'ctrl' as const, key: 'q' };
        },
      },
    });

    await vi.advanceTimersByTimeAsync(0);
    const baseline = started;
    for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(2500);
    // Five intervals, one in-flight poll: exactly one further attempt.
    expect(started - baseline).toBe(1);

    release?.();
    vi.useRealTimers();
    await run;
  });

  it('control: no waiting means no extra polls', async () => {
    // Without this the assertions above would also hold for an implementation
    // that polls on every frame regardless of time.
    expect(await withPolling(0)).toBe(0);
  });
});
