import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';
import { LocalServerManager, runLocalTool, tgrepRpc } from '../src/providers/llama-server.js';
let root: string; let server: Server | undefined;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-local-server-')); });
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
it('uses native argv, confines cwd, bounds output and does not inherit credentials', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'fixture-hidden-value');
  const result = await runLocalTool(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({cwd:process.cwd(),token:!!process.env.GITHUB_TOKEN}))'], root);
  expect(JSON.parse(result.stdout)).toMatchObject({ token: false });
  await expect(runLocalTool(process.execPath, ['-e', 'process.stdout.write("x".repeat(3000000))'], root)).rejects.toThrow('limit');
  await expect(runLocalTool(process.execPath, ['-e', 'setInterval(()=>{},1000)'], root, undefined, 30)).rejects.toThrow('limit');
});
it('speaks bounded newline JSON-RPC to a loopback daemon', async () => {
  server = createServer(socket => { socket.once('data', chunk => { const request = JSON.parse(chunk.toString()); expect(request).toMatchObject({ jsonrpc: '2.0', method: 'status', id: 1 }); socket.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { indexing: false } }) + '\n'); }); });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  expect(await tgrepRpc((server.address() as { port: number }).port, 'status')).toEqual({ indexing: false });
});
it('never kills a process merely because its PID was persisted and rejects invented tgrep ports', async () => {
  const manager = new LocalServerManager(root); const file = join(root, 'bitnet-server.pid'); writeFileSync(file, JSON.stringify({ pid: process.pid }));
  await manager.stop('bitnet'); expect(existsSync(file)).toBe(true); expect(manager.status('bitnet')).toEqual({ running: false, managed: false });
  await expect(manager.startTgrepServer(root, 7700)).rejects.toThrow('own port');
  await expect(manager.startBitNet({ modelPath: '../outside.gguf' })).rejects.toThrow('absolute');
});
