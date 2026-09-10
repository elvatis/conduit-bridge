import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BridgeConfig } from './types.js';

export type LogLevel = 'silent' | 'info' | 'debug';

export class Logger {
  private _level: LogLevel;
  private _listeners: Array<(line: string) => void> = [];
  private _fileDestination?: string;
  private _muteConsole: boolean = false;
  private _maxFileSizeBytes: number = 5 * 1024 * 1024; // 5 MB

  constructor(level: LogLevel = 'info') {
    this._level = level;
  }

  setLevel(level: LogLevel) { this._level = level; }

  setFileDestination(filePath: string, muteConsole: boolean = false) {
    this._fileDestination = filePath;
    this._muteConsole = muteConsole;
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    } catch { /* ignore */ }
  }

  muteConsole(muted: boolean = true) {
    this._muteConsole = muted;
  }

  isConsoleMuted(): boolean {
    return this._muteConsole;
  }

  /** Subscribe to log output (for streaming to VS Code Output Channel) */
  onLine(cb: (line: string) => void) {
    this._listeners.push(cb);
    return () => { this._listeners = this._listeners.filter(l => l !== cb); };
  }

  info(msg: string) {
    if (this._level === 'silent') return;
    this._emit(`[conduit-bridge] ${msg}`);
  }

  debug(msg: string) {
    if (this._level !== 'debug') return;
    this._emit(`[conduit-bridge:debug] ${msg}`);
  }

  warn(msg: string) {
    if (this._level === 'silent') return;
    this._emit(`[conduit-bridge:warn] ${msg}`);
  }

  error(msg: string) {
    this._emit(`[conduit-bridge:error] ${msg}`);
  }

  private _emit(line: string) {
    const ts = new Date().toISOString().slice(0, 19);
    const full = `${ts} ${line}`;
    if (!this._muteConsole) {
      console.error(full);
    }
    if (this._fileDestination) {
      this._writeToFile(full);
    }
    for (const cb of this._listeners) cb(full);
  }

  private _writeToFile(line: string) {
    if (!this._fileDestination) return;
    try {
      if (existsSync(this._fileDestination)) {
        const stats = statSync(this._fileDestination);
        if (stats.size > this._maxFileSizeBytes) {
          for (let i = 2; i >= 1; i--) {
            const oldPath = `${this._fileDestination}.${i}`;
            const newPath = `${this._fileDestination}.${i + 1}`;
            if (existsSync(oldPath)) renameSync(oldPath, newPath);
          }
          renameSync(this._fileDestination, `${this._fileDestination}.1`);
        }
      }
      appendFileSync(this._fileDestination, line + '\n', 'utf-8');
    } catch {
      // Never crash on logging failure
    }
  }
}

export const logger = new Logger();

export function configureLogger(cfg: Pick<BridgeConfig, 'logLevel'>) {
  logger.setLevel(cfg.logLevel);
}
