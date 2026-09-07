import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { runtimeDir } from '../config.js';
import { resolveExecutable, buildMinimalEnv } from './cli-util.js';
import { SkillError } from '../skills/index.js';

/** Native executable resolution forbids implicit Windows command shells. */
export function localToolExecutable(name: string): string {
  const binary = resolveExecutable(name);
  if (!binary || /\.(cmd|bat|ps1)$/i.test(binary)) throw new SkillError('Required native tool executable is unavailable', 503);
  return binary;
}
/** Run a trusted native tool with bounded output, elapsed time and cancellation. */
export async function runLocalTool(binary: string, args: string[], cwd: string, signal?: AbortSignal, timeoutMs = 10000): Promise<{ stdout: string; exitCode: number }> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(localToolExecutable(binary), args, { cwd, env: buildMinimalEnv(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let bytes = 0; let failed = false;
    const stop = () => { failed = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) stop(); else chunks.push(chunk); });
    child.once('error', () => { cleanup(); reject(new SkillError('Local tool could not start', 503)); });
    child.once('close', code => { cleanup(); if (failed) reject(new SkillError('Local tool cancelled or exceeded its execution limit', 408)); else resolve({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode: code ?? -1 }); });
  });
}

/** One bounded JSON-RPC request to a loopback tgrep daemon; this is TCP, not HTTP. */
export async function tgrepRpc(port: number, method: 'status' | 'search' | 'reload', params: unknown = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new SkillError('Invalid tgrep port');
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port }); let content = ''; let bytes = 0;
    const fail = () => { cleanup(); socket.destroy(); reject(new SkillError('tgrep daemon unavailable or invalid response', 503)); };
    const timer = setTimeout(fail, method === 'reload' ? 60000 : 5000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', fail); };
    signal?.addEventListener('abort', fail, { once: true });
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'));
    socket.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk); if (bytes > 2 * 1024 * 1024) { fail(); return; }
      content += chunk;
      if (!content.includes('\n')) return;
      try {
        const response = JSON.parse(content.slice(0, content.indexOf('\n')));
        if (response.jsonrpc !== '2.0' || response.id !== 1 || response.error || !response.result || typeof response.result !== 'object' || Array.isArray(response.result)) { fail(); return; }
        cleanup(); socket.destroy(); resolve(response.result);
      } catch { fail(); }
    });
    socket.once('error', fail); socket.once('end', () => { if (!content.includes('\n')) fail(); });
  });
}

/** Per-workspace tgrep index cache, separated from source files and other workspaces. */
export function tgrepCacheDirectory(root: string): string { return join(runtimeDir(), 'tgrep', createHash('sha256').update(realpathSync.native(root)).digest('hex')); }
/** Exclude credential/control trees during explicit native indexing. */
export const TGREP_EXCLUSIONS = ['.git', '.ssh', '.conduit', '.codex', '.agents', 'node_modules'];
/** BitNet's CPU server configuration; the binary is supplied through BITNET_SERVER_BINARY. */
export interface BitNetServerConfig { modelPath?: string; port?: number; threads?: number; ctx_size?: number }
/** Only children owned by this process are stoppable; stale PID files never authorize killing a process. */
export interface LocalServerStatus { running: boolean; managed: boolean; pid?: number; port?: number; root?: string }
interface OwnedServer { child: ChildProcess; root?: string; port?: number; file: string }

/** Lifecycle manager for explicit administrator-started native BitNet and tgrep processes. */
export class LocalServerManager {
  private readonly owned = new Map<'bitnet' | 'tgrep', OwnedServer>();
  constructor(private readonly configuredDirectory?: string) {}
  private get directory(): string { return this.configuredDirectory ?? runtimeDir(); }
  /** Report only confirmed live children owned by this bridge process. */
  status(kind: 'bitnet' | 'tgrep'): LocalServerStatus {
    const owned = this.owned.get(kind);
    return owned && owned.child.exitCode === null && !owned.child.killed ? { running: true, managed: true, pid: owned.child.pid, port: owned.port, root: owned.root } : { running: false, managed: false };
  }
  private launch(kind: 'bitnet' | 'tgrep', executable: string, args: string[], cwd: string, root?: string, port?: number): OwnedServer {
    if (this.status(kind).running) throw new SkillError('A managed server is already running', 409);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, kind + '-server.pid');
    if (existsSync(file)) {
      // Refuse adopting or overwriting a previous owner's record, including a stale record.
      throw new SkillError('A previous server PID record exists; inspect it before removing the stale record', 409);
    }
    const child = spawn(localToolExecutable(executable), args, { cwd, env: buildMinimalEnv(), shell: false, windowsHide: true, stdio: 'ignore' });
    const owned = { child, file, root, port }; this.owned.set(kind, owned);
    child.on('error', () => { if (this.owned.get(kind) === owned) this.owned.delete(kind); });
    child.once('exit', () => {
      if (this.owned.get(kind) === owned) { this.owned.delete(kind); try { unlinkSync(file); } catch { /* Already removed at shutdown. */ } }
    });
    try { if (child.pid) writeFileSync(file, JSON.stringify({ pid: child.pid, ownerPid: process.pid, port, root }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { this.owned.delete(kind); child.kill('SIGKILL'); throw error; }
    return owned;
  }
  private async ready(kind: 'bitnet' | 'tgrep', probe: () => Promise<boolean>, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + 30000;
    try {
      while (Date.now() < deadline) {
        signal?.throwIfAborted();
        if (!this.status(kind).running) throw new SkillError('Native server exited during startup', 503);
        if (await probe()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new SkillError('Native server readiness timed out', 504);
    } catch (error) { await this.stop(kind); throw error; }
  }
  /** Start the installed BitNet-built llama-server directly, without invoking a shell or downloading models. */
  async startBitNet(config: BitNetServerConfig = {}, signal?: AbortSignal): Promise<LocalServerStatus> {
    const model = config.modelPath || process.env.BITNET_MODEL_PATH;
    if (!model || !isAbsolute(model) || !/\.gguf$/i.test(model) || !lstatSync(model).isFile() || lstatSync(model).isSymbolicLink()) throw new SkillError('Configure an absolute regular GGUF model path');
    const port = config.port ?? 8080, threads = config.threads ?? 2, ctx = config.ctx_size ?? 2048;
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || !Number.isSafeInteger(threads) || threads < 1 || threads > 256 || !Number.isSafeInteger(ctx) || ctx < 512 || ctx > 131072) throw new SkillError('Invalid BitNet server configuration');
    const compatibilityArgs: string[] = [];
    // Host-controlled model compatibility settings; never accept arbitrary argv from HTTP callers.
    const tokenizerPre = process.env.BITNET_TOKENIZER_PRE;
    if (tokenizerPre) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tokenizerPre)) throw new SkillError('Invalid BitNet tokenizer preset');
      compatibilityArgs.push('--override-kv', `tokenizer.ggml.pre=str:${tokenizerPre}`);
    }
    const chatTemplate = process.env.BITNET_CHAT_TEMPLATE_PATH;
    if (chatTemplate) {
      if (!isAbsolute(chatTemplate) || !/\.jinja2?$/i.test(chatTemplate) || !existsSync(chatTemplate)) throw new SkillError('Configure an absolute BitNet Jinja template path');
      const entry = lstatSync(chatTemplate);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 65536) throw new SkillError('BitNet template must be a regular file of at most 64 KiB');
      compatibilityArgs.push('--chat-template-file', realpathSync.native(chatTemplate));
    }
    signal?.throwIfAborted();
    // A pre-existing service must not satisfy readiness for a child that fails to bind.
    await new Promise<void>((resolve, reject) => {
      const probe = createServer(); probe.once('error', () => reject(new SkillError('BitNet port is already in use or unavailable', 409)));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
    });
    signal?.throwIfAborted();
    this.launch('bitnet', process.env.BITNET_SERVER_BINARY || 'llama-server', ['-m', realpathSync.native(model), '-c', String(ctx), '-t', String(threads), '-ngl', '0', '--host', '127.0.0.1', '--port', String(port), '-cb', ...compatibilityArgs], this.directory, undefined, port);
    await this.ready('bitnet', async () => { try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); return response.ok; } catch { return false; } }, signal);
    return this.status('bitnet');
  }
  /** Start tgrep for one canonical workspace. Upstream chooses a loopback port recorded in serve.json. */
  async startTgrepServer(indexPath: string, port?: number, signal?: AbortSignal): Promise<void> {
    if (port !== undefined) throw new SkillError('Current tgrep chooses its own port; omit port');
    const root = realpathSync.native(indexPath);
    if (!lstatSync(indexPath).isDirectory() || lstatSync(indexPath).isSymbolicLink()) throw new SkillError('tgrep root must be a regular directory');
    const cache = tgrepCacheDirectory(root); mkdirSync(cache, { recursive: true, mode: 0o700 });
    signal?.throwIfAborted();
    const owned = this.launch('tgrep', process.env.TGREP_BINARY || 'tgrep', ['serve', root, '--index-path', cache, '--max-filesize', '64K', ...TGREP_EXCLUSIONS.flatMap(path => ['--exclude', path])], root, root);
    await this.ready('tgrep', async () => {
      try {
        const info = JSON.parse(readFileSync(join(cache, 'serve.json'), 'utf8'));
        if (info.pid !== owned.child.pid) return false;
        await tgrepRpc(info.port, 'status', {}, signal); owned.port = info.port; return true;
      } catch { return false; }
    }, signal);
  }
  /** Stop only a child this manager started; never kill a PID read from disk. */
  async stop(kind: 'bitnet' | 'tgrep'): Promise<void> {
    const owned = this.owned.get(kind); if (!owned) return;
    const exited = new Promise<void>(resolve => { owned.child.once('exit', () => resolve()); owned.child.once('error', () => resolve()); });
    owned.child.kill('SIGKILL');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([exited, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SkillError('Native server did not stop within its deadline', 504)), 3000); })]); }
    finally { clearTimeout(timer); }
    if (this.owned.get(kind) === owned && owned.child.exitCode !== null) { this.owned.delete(kind); try { unlinkSync(owned.file); } catch { /* Already removed. */ } }
  }
  /** Stop the managed tgrep daemon. */
  async stopTgrepServer(): Promise<void> { await this.stop('tgrep'); }
  /** Report whether this manager owns a live tgrep child. */
  async tgrepServerStatus(): Promise<boolean> { return this.status('tgrep').running; }
}

/** Shared service lifecycle owner. */
export const localServers = new LocalServerManager();
/** Start the shared tgrep daemon for a directory. */
export async function startTgrepServer(indexPath: string, port?: number): Promise<void> { await localServers.startTgrepServer(indexPath, port); }
/** Stop the shared owned tgrep daemon. */
export async function stopTgrepServer(): Promise<void> { await localServers.stopTgrepServer(); }
/** Query shared tgrep process ownership. */
export async function tgrepServerStatus(): Promise<boolean> { return localServers.tgrepServerStatus(); }
