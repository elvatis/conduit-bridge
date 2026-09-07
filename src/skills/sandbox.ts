import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveExecutable } from '../providers/cli-util.js';
import { resolveSkillPath } from './filesystem.js';
import { SkillError, type SkillDefinition } from './index.js';

/** Minimal command environment that deliberately omits provider and GitHub credentials. */
export function commandEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']) if (source[key]) env[key] = source[key];
  env.NO_COLOR = '1';
  return env;
}

/** Separate-process command execution. The selected cwd is not OS filesystem confinement. */
export const sandboxSkill: SkillDefinition = {
  name: 'sandbox',
  description: 'Run an explicitly approved executable in a separate bounded process. This is not an OS sandbox.',
  effect: 'execute',
  schema: { type: 'object', additionalProperties: false, required: ['executable'], properties: {
    executable: { type: 'string', maxLength: 100 }, args: { type: 'array', items: { type: 'string' }, maxItems: 64 },
    cwd: { type: 'string', maxLength: 4096 }, timeoutMs: { type: 'integer', minimum: 100, maximum: 60000 },
  } },
  async execute(input, context) {
    if (typeof input.executable !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(input.executable)) throw new SkillError('Executable must be a command name from the service PATH');
    const cwd = resolveSkillPath(context, input.cwd ?? '.');
    if (!statSync(cwd).isDirectory()) throw new SkillError('Command cwd must be a workspace directory');
    const executable = resolveExecutable(input.executable);
    if (!executable) throw new SkillError('Executable was not found', 404);
    if (/\.(cmd|bat|ps1)$/i.test(executable)) throw new SkillError('Use a native executable; implicit shell wrappers are not accepted');
    const args = (input.args ?? []) as string[];
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0'))) throw new SkillError('Invalid executable arguments');
    const timeoutMs = typeof input.timeoutMs === 'number' ? input.timeoutMs : 10000;
    context.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd, env: commandEnvironment(), shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] };
      let size = 0; let reason: string | undefined; let closed = false;
      const kill = (why: string) => {
        if (closed || reason) return;
        reason = why;
        if (child.pid) {
          if (process.platform === 'win32') {
            const systemRoot = process.env.SystemRoot || process.env.WINDIR;
            if (systemRoot) { const killer = spawn(join(systemRoot, 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill('SIGKILL')); }
            else child.kill('SIGKILL');
          } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
        }
      };
      const timer = setTimeout(() => kill('timeout'), timeoutMs);
      const abort = () => kill('cancelled');
      context.signal.addEventListener('abort', abort, { once: true });
      if (context.signal.aborted) abort();
      for (const stream of ['stdout', 'stderr'] as const) child[stream].on('data', (chunk: Buffer) => {
        if (size + chunk.length > 65536) { kill('output_limit'); return; }
        size += chunk.length; chunks[stream].push(chunk);
      });
      child.on('error', () => { closed = true; clearTimeout(timer); context.signal.removeEventListener('abort', abort); reject(new SkillError('Executable could not be started', 500)); });
      child.on('close', (code, signal) => {
        closed = true; clearTimeout(timer); context.signal.removeEventListener('abort', abort);
        resolve({ exitCode: code, signal, stopReason: reason ?? 'exited', stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8'), isolation: 'separate-process', filesystemConfined: false });
      });
    });
  },
};
