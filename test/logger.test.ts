import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, configureLogger, logger } from '../src/logger.js';

describe('Logger', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Logger writes to console.error; silence it and capture calls.
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('emits info/warn/error at the default (info) level', () => {
    const log = new Logger();
    log.info('hello');
    log.warn('careful');
    log.error('boom');
    expect(errSpy).toHaveBeenCalledTimes(3);
    expect(errSpy.mock.calls[0][0]).toContain('[conduit-bridge] hello');
    expect(errSpy.mock.calls[1][0]).toContain('[conduit-bridge:warn] careful');
    expect(errSpy.mock.calls[2][0]).toContain('[conduit-bridge:error] boom');
  });

  it('suppresses debug output unless the level is debug', () => {
    const log = new Logger('info');
    log.debug('noisy');
    expect(errSpy).not.toHaveBeenCalled();

    log.setLevel('debug');
    log.debug('noisy');
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toContain('[conduit-bridge:debug] noisy');
  });

  it('silent level mutes info/warn/debug but still emits errors', () => {
    const log = new Logger('silent');
    log.info('i');
    log.warn('w');
    log.debug('d');
    expect(errSpy).not.toHaveBeenCalled();
    log.error('e');
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toContain('[conduit-bridge:error] e');
  });

  it('prefixes every line with an ISO timestamp', () => {
    const log = new Logger();
    log.info('ping');
    const line = errSpy.mock.calls[0][0] as string;
    // e.g. "2026-07-17T12:34:56 [conduit-bridge] ping"
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} \[conduit-bridge] ping$/);
  });

  it('notifies onLine subscribers and stops after unsubscribe', () => {
    const log = new Logger();
    const lines: string[] = [];
    const unsub = log.onLine(line => lines.push(line));

    log.info('first');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('first');

    unsub();
    log.info('second');
    expect(lines).toHaveLength(1); // no new line after unsubscribe
  });

  it('delivers a line to every active subscriber', () => {
    const log = new Logger();
    const a: string[] = [];
    const b: string[] = [];
    log.onLine(line => a.push(line));
    log.onLine(line => b.push(line));
    log.info('broadcast');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('configureLogger applies the level to the shared singleton logger', () => {
    configureLogger({ logLevel: 'silent' });
    logger.info('should be muted');
    expect(errSpy).not.toHaveBeenCalled();

    configureLogger({ logLevel: 'info' });
    logger.info('should show');
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
