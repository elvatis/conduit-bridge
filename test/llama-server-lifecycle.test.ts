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
  vi.stubEnv('BITNET_MODEL_PATH', ''); vi.stubEnv('BITNET_AUTOSTART', '');
  vi.stubEnv('BITNET_TOKENIZER_PRE', ''); vi.stubEnv('BITNET_CHAT_TEMPLATE_PATH', '');
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve)); port = (reservation.address() as { port: number }).port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  child = Object.assign(new EventEmitter(), { pid: 123456, exitCode: null as number | null, killed: false, kill: vi.fn(() => { child.killed = true; child.exitCode = 0; child.emit('exit', 0); return true; }) });
  vi.mocked(spawn).mockReset().mockReturnValue(child as any);
});
it('passes bounded host tokenizer/template settings and rejects malformed overrides before spawning', async () => {
  const template = join(root, 'chat template.jinja'); writeFileSync(template, '{{ messages[0].content }}');
  vi.stubEnv('BITNET_TOKENIZER_PRE', 'llama-bpe'); vi.stubEnv('BITNET_CHAT_TEMPLATE_PATH', template);
  const manager = new LocalServerManager(root); await manager.startBitNet({ modelPath: join(root, 'fixture.gguf'), port });
  const args = vi.mocked(spawn).mock.calls[0][1]!;
  expect(args).toEqual(expect.arrayContaining(['--override-kv', 'tokenizer.ggml.pre=str:llama-bpe', '--chat-template-file']));
  expect(args[args.indexOf('--chat-template-file') + 1]).toMatch(/chat template\.jinja$/);
  await manager.stop('bitnet'); vi.mocked(spawn).mockClear();
  vi.stubEnv('BITNET_TOKENIZER_PRE', 'llama-bpe,other=str:value');
  await expect(manager.startBitNet({ modelPath: join(root, 'fixture.gguf'), port })).rejects.toThrow('preset');
  vi.stubEnv('BITNET_TOKENIZER_PRE', 'llama-bpe'); writeFileSync(template, 'x'.repeat(65537));
  await expect(manager.startBitNet({ modelPath: join(root, 'fixture.gguf'), port })).rejects.toThrow('64 KiB');
  expect(spawn).not.toHaveBeenCalled();
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


it('automatically starts an available configured server and respects explicit opt-out', async () => {
  const manager = new LocalServerManager(root);
  vi.stubEnv('BITNET_MODEL_PATH', join(root, 'fixture.gguf')); vi.stubEnv('BITNET_URL', `http://127.0.0.1:${port}`);
  vi.stubEnv('BITNET_THREADS', '3'); vi.stubEnv('BITNET_CTX_SIZE', '4096');
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
  expect(await manager.autoStartBitNet()).toMatchObject({ running: true, managed: true, autoStart: { state: 'ready' } });
  expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(expect.arrayContaining(['-t', '3', '-c', '4096']));
  await manager.stop('bitnet'); vi.mocked(spawn).mockClear();
  vi.stubEnv('BITNET_AUTOSTART', 'false');
  expect(await manager.autoStartBitNet()).toMatchObject({ running: false, autoStart: { state: 'disabled' } });
  expect(spawn).not.toHaveBeenCalled();
});

it('reuses a healthy external server without claiming ownership or killing it', async () => {
  const manager = new LocalServerManager(root);
  vi.stubEnv('BITNET_MODEL_PATH', join(root, 'fixture.gguf')); vi.stubEnv('BITNET_URL', `http://127.0.0.1:${port}`);
  expect(await manager.autoStartBitNet()).toMatchObject({ managed: false, autoStart: { state: 'external' } });
  await manager.stop('bitnet'); expect(spawn).not.toHaveBeenCalled(); expect(child.kill).not.toHaveBeenCalled();
});

it('keeps missing, invalid and remote optional inference from blocking the bridge', async () => {
  const manager = new LocalServerManager(root);
  expect(await manager.autoStartBitNet()).toMatchObject({ autoStart: { state: 'unconfigured' } });
  vi.stubEnv('BITNET_MODEL_PATH', join(root, 'missing.gguf')); vi.stubEnv('BITNET_URL', `http://127.0.0.1:${port}`);
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
  expect(await manager.autoStartBitNet()).toMatchObject({ autoStart: { state: 'failed' } });
  vi.stubEnv('BITNET_URL', 'https://remote.example.test'); vi.mocked(fetch).mockClear();
  expect(await manager.autoStartBitNet()).toMatchObject({ autoStart: { state: 'failed' } });
  expect(fetch).not.toHaveBeenCalled(); expect(spawn).not.toHaveBeenCalled();
});
