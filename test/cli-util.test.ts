import { describe, expect, it } from 'vitest';
import { runCli } from '../src/providers/cli-util.js';

describe('runCli cancellation', () => {
  it('terminates a child process when the request signal is aborted', async () => {
    const controller = new AbortController();
    const promise = runCli({
      binPath: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 60000)'],
      timeoutMs: 60000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 25);
    const result = await promise;
    expect(result.aborted).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});
