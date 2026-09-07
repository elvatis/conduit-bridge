import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Small single-host JSON records, with exclusive mutation locks and atomic replacement. */
export class RuntimeJsonFile<T> {
  constructor(readonly path: string, private readonly initial: () => T) {}
  /** Read bounded JSON; corrupted state fails closed instead of resetting quotas. */
  read(): T {
    if (!existsSync(this.path)) return this.initial();
    const info = lstatSync(this.path);
    if (!info.isFile() || info.nlink !== 1 || info.size > 8 * 1024 * 1024) throw new Error('Invalid runtime state file');
    return JSON.parse(readFileSync(this.path, 'utf8')) as T;
  }
  /** Serialize read-modify-write across processes. A busy lock requires a caller retry. */
  update<R>(operation: (state: T) => R): R {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = this.path + '.lock';
    const fd = openSync(lock, 'wx', 0o600);
    const temp = this.path + '.' + randomUUID() + '.tmp';
    try {
      const state = this.read();
      const result = operation(state);
      const encoded = JSON.stringify(state);
      if (Buffer.byteLength(encoded) > 8 * 1024 * 1024) throw new Error('Runtime state size limit reached');
      writeFileSync(temp, encoded, { flag: 'wx', mode: 0o600 });
      renameSync(temp, this.path);
      return result;
    } finally {
      closeSync(fd); unlinkSync(lock);
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
}
