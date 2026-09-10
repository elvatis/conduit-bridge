import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BridgeConfig } from './types.js';

export async function ensureBridgeListener(options: {
  ready: () => Promise<boolean>;
  spawn: () => void;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  intervalMs?: number;
}): Promise<'attached' | 'spawned'> {
  if (await options.ready()) return 'attached';
  options.spawn();
  const sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 50;
  const intervalMs = options.intervalMs ?? 100;
  for (let i = 0; i < attempts; i++) {
    await sleep(intervalMs);
    if (await options.ready()) return 'spawned';
  }
  throw new Error('Local listener did not become ready');
}

export function spawnBridgeDaemon(cfg: Pick<BridgeConfig, 'host' | 'port'>, cliPath: string, logFile: string): void {
  mkdirSync(dirname(logFile), { recursive: true });
  const logFd = openSync(logFile, 'a');
  const child = spawn(process.execPath, [
    cliPath,
    'start',
    `--host=${cfg.host}`,
    `--port=${String(cfg.port)}`,
  ], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();
}

export function cliEntryPath(): string {
  const argvPath = process.argv[1] || '';
  if (argvPath.endsWith('cli.js') || argvPath.endsWith('cli.ts')) return argvPath;
  return join(process.cwd(), 'dist', 'cli.js');
}
