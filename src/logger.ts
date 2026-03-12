import type { BridgeConfig } from './types.js';

export type LogLevel = 'silent' | 'info' | 'debug';

export class Logger {
  private _level: LogLevel;
  private _listeners: Array<(line: string) => void> = [];

  constructor(level: LogLevel = 'info') {
    this._level = level;
  }

  setLevel(level: LogLevel) { this._level = level; }

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
    console.error(full);
    for (const cb of this._listeners) cb(full);
  }
}

export const logger = new Logger();

export function configureLogger(cfg: Pick<BridgeConfig, 'logLevel'>) {
  logger.setLevel(cfg.logLevel);
}
