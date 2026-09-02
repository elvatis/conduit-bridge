import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  agentCwd,
  findMultilineArg,
  quoteWin,
  runCli,
  sandboxCwd,
} from '../src/providers/cli-util.js';

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

  it('agentCwd honours an absolute existing workspace path', () => {
    expect(agentCwd({ cwd: process.cwd() })).toBe(process.cwd());
  });

  // A CLI agent started in homedir() can read and write the whole user profile.
  // Anything unusable must land in an empty sandbox instead.
  it('agentCwd never falls back to the home directory', () => {
    const unusable = [
      { cwd: 'relative/path' },
      { cwd: join(process.cwd(), 'does-not-exist-cwd-xyz') },
      { cwd: '   ' },
      {},
    ];
    for (const req of unusable) {
      const resolved = agentCwd(req);
      expect(resolved, JSON.stringify(req)).toBe(sandboxCwd());
      expect(resolved, JSON.stringify(req)).not.toBe(homedir());
    }
  });

  it('sandboxCwd is an existing empty scratch directory, not the profile', () => {
    const dir = sandboxCwd();
    expect(existsSync(dir)).toBe(true);
    expect(dir.startsWith(homedir()) && dir === homedir()).toBe(false);
  });

  // The outage: `claude` resolves to claude.cmd, runCli routed it through
  // cmd.exe, and cmd.exe cut the command line at the first newline — so the CLI
  // received the system prompt alone and the user's question was gone, exit 0.
  it('findMultilineArg spots a prompt that cmd.exe would truncate', () => {
    expect(findMultilineArg(['-p', 'single line', '--model', 'x'])).toBe(-1);
    expect(findMultilineArg(['-p', 'system\n\nUser: question'])).toBe(1);
    expect(findMultilineArg(['a', 'b\r\nc'])).toBe(1);
  });

  it('quoteWin keeps an empty argument as a slot instead of dropping it', () => {
    expect(quoteWin('')).toBe('""');
    // Dropped, the next token would be read as this flag's value.
    expect(['--tools', '', '--model', 'x'].map(quoteWin).join(' '))
      .toBe('--tools "" --model x');
  });

  it('cli-claude and cli-codex send the prompt on stdin, never on argv', () => {
    for (const file of ['cli-claude.ts', 'cli-codex.ts']) {
      const src = readFileSync(join(process.cwd(), 'src/providers', file), 'utf8');
      expect(src, file).toMatch(/stdin:\s*prompt/);
    }
  });

  it('grok-cli uses shared runCli so Windows abort taskkills the process tree', () => {
    const src = readFileSync(join(process.cwd(), 'src/providers/grok-cli.ts'), 'utf8');
    expect(src).toContain("from './cli-util.js'");
    expect(src).toMatch(/\brunCli\b/);
    expect(src).not.toContain("proc.kill('SIGTERM')");
  });
});
