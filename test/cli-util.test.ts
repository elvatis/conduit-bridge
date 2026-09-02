import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('grok-cli uses shared runCli so Windows abort taskkills the process tree', () => {
    const src = readFileSync(join(process.cwd(), 'src/providers/grok-cli.ts'), 'utf8');
    expect(src).toContain("from './cli-util.js'");
    expect(src).toMatch(/\brunCli\b/);
    expect(src).not.toContain("proc.kill('SIGTERM')");
  });
});
