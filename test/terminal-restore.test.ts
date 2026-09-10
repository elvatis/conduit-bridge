import { afterEach, describe, expect, it } from 'vitest';
import { guardTerminalRestore } from '../src/interactive-cli.js';

/**
 * The existing `finally` in runChatCommand already restores the terminal when
 * runInteractiveChat throws. It cannot help on the paths that never return
 * through that await: a signal kills the process outright, and a throw inside a
 * timer callback is an uncaught exception rather than a rejected promise. The
 * busy spinner paints from a setInterval, so the render path really does have a
 * route out of the process.
 *
 * What is left behind is not cosmetic: the alternate screen stays active, mouse
 * tracking keeps emitting escape sequences and the cursor stays hidden, so the
 * shell appears to echo nothing and needs `reset`.
 *
 * Signals are not raised here on purpose, since that would take the test runner
 * with them. What is asserted is the contract: the handlers exist while the UI
 * runs, they disappear afterwards, and restoration happens exactly once.
 */

const EVENTS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException', 'unhandledRejection', 'exit'] as const;

const counts = () => Object.fromEntries(EVENTS.map(e => [e, process.listenerCount(e)]));

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; });

describe('guardTerminalRestore', () => {
  it('registers a handler on every path that bypasses finally', () => {
    const before = counts();
    stop = guardTerminalRestore(() => {});
    const during = counts();
    for (const event of EVENTS) {
      expect(during[event], `no handler registered for ${event}`).toBe(before[event] + 1);
    }
  });

  it('removes every handler again, so repeated sessions do not accumulate', () => {
    const before = counts();
    stop = guardTerminalRestore(() => {});
    stop();
    stop = undefined;
    expect(counts()).toEqual(before);
  });

  it('restores exactly once even when two paths fire', () => {
    // A signal can arrive while the normal teardown is already running. Writing
    // the restore sequence twice is not harmless: the second one re-hides the
    // cursor after the first made it visible.
    let calls = 0;
    stop = guardTerminalRestore(() => { calls += 1; });
    const onExit = process.listeners('exit').at(-1) as () => void;
    onExit();
    onExit();
    expect(calls).toBe(1);
  });

  it('survives a restore that itself throws, because the terminal may be gone', () => {
    stop = guardTerminalRestore(() => { throw new Error('stream already closed'); });
    const onExit = process.listeners('exit').at(-1) as () => void;
    expect(() => onExit()).not.toThrow();
  });

  it('control: without the guard nothing is registered', () => {
    // Without this the first assertion could pass against handlers some other
    // module installed.
    const before = counts();
    const noop = guardTerminalRestore(() => {});
    noop();
    expect(counts()).toEqual(before);
  });
});
