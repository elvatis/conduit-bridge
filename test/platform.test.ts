import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSupportedPlatform, platformSupport } from '../src/platform.js';

describe('supported desktop platforms', () => {
  it('supports Windows Desktop', () => {
    expect(platformSupport('win32')).toMatchObject({ supported: true, label: 'Windows Desktop' });
    expect(() => assertSupportedPlatform('win32')).not.toThrow();
  });

  it('supports Linux Desktop', () => {
    expect(platformSupport('linux')).toMatchObject({ supported: true, label: 'Linux Desktop' });
    expect(() => assertSupportedPlatform('linux')).not.toThrow();
  });

  it('rejects platforms outside the current support scope', () => {
    expect(platformSupport('darwin')).toMatchObject({ supported: false, platform: 'darwin' });
    expect(() => assertSupportedPlatform('darwin')).toThrow(/Windows Desktop and Linux Desktop only/);
  });

  it('keeps the platform gate on the CLI, not BridgeServer.start', () => {
    const server = readFileSync(join(process.cwd(), 'src/server.ts'), 'utf8');
    const cli = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf8');
    expect(server).not.toMatch(/assertSupportedPlatform\s*\(/);
    expect(cli).toMatch(/assertSupportedPlatform\s*\(/);
  });
});
