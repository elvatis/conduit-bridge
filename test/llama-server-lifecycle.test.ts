import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
import { spawn } from 'node:child_process';
import { LocalServerManager } from '../src/providers/llama-server.js';
let root: string; let port: number; let child: EventEmitter & { pid: number; exitCode: number | null; killed: boolean; kill: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'conduit-lifecycle-')); writeFileSync(join(root, 'fixture.gguf'), 'synthetic fixture, not an inference model');
  vi.stubEnv('BITNET_SERVER_BINARY', process.execPath); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve)); port = (reservation.address() as { port: number }).port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  child = Object.assign(new EventEmitter(), { pid: 123456, exitCode: null as number | null, killed: false, kill: vi.fn(() => { child.killed = true; child.exitCode = 0; child.emit('exit', 0); return true; }) });
  vi.mocked(spawn).mockReset().mockReturnValue(child as any);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }); });
it('launches fixed CPU/loopback argv, persists ownership and removes only its owned PID on stop', async () => {
  const manager = new LocalServerManager(root); const status = await manager.startBitNet({ modelPath: join(root, 'fixture.gguf'), port, threads: 3, ctx_size: 4096 });
  expect(status).toMatchObject({ running: true, managed: true, pid: 123456, port });
  expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(expect.arrayContaining(['-ngl', '0', '--host', '127.0.0.1', '--port', String(port), '-t', '3', '-c', '4096']));
  expect(vi.mocked(spawn).mock.calls[0][2]).toMatchObject({ shell: false, windowsHide: true });
  expect(JSON.parse(readFileSync(join(root, 'bitnet-server.pid'), 'utf8'))).toMatchObject({ pid: 123456, ownerPid: process.pid });
  await manager.stop('bitnet'); expect(child.kill).toHaveBeenCalledWith('SIGKILL'); expect(existsSync(join(root, 'bitnet-server.pid'))).toBe(false);
});
it('stops a spawned child when writing its ownership record loses a race', async () => {
  vi.mocked(spawn).mockImplementation(() => { writeFileSync(join(root, 'bitnet-server.pid'), 'other owner'); return child as any; });
  await expect(new LocalServerManager(root).startBitNet({ modelPath: join(root, 'fixture.gguf'), port })).rejects.toThrow();
  expect(child.killed).toBe(true); expect(readFileSync(join(root, 'bitnet-server.pid'), 'utf8')).toBe('other owner');
});
it('cancels startup and refuses an occupied port before spawning', async () => {
  const controller = new AbortController(); vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(); return new Response('{}', { status: 503 }); }));
  await expect(new LocalServerManager(root).startBitNet({ modelPath: join(root, 'fixture.gguf'), port }, controller.signal)).rejects.toThrow(); expect(child.killed).toBe(true);
  vi.mocked(spawn).mockClear(); const occupied = createServer(); await new Promise<void>(resolve => occupied.listen(port, '127.0.0.1', resolve));
  try { await expect(new LocalServerManager(root).startBitNet({ modelPath: join(root, 'fixture.gguf'), port })).rejects.toThrow('port'); expect(spawn).not.toHaveBeenCalled(); }
  finally { await new Promise<void>(resolve => occupied.close(() => resolve())); }
});
