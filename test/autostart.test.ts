import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'scripts');

describe('desktop autostart installers', () => {
  it('installs Linux graphical-session autostart without remote-display services', () => {
    const script = readFileSync(join(root, 'install-autostart.sh'), 'utf8');
    expect(script).toContain('XDG_CONFIG_HOME');
    expect(script).toContain('autostart_dir');
    expect(script).toContain('.conduit');
    expect(script).toContain('conduit-bridge-start');
    expect(script).toContain('conduit-bridge.desktop');
    expect(script).toContain('127.0.0.1 --port=31338');
    expect(script).not.toMatch(/x11vnc|noVNC|websockify|5900|6080/i);
  });

  it('installs Windows logon autostart for the interactive user', () => {
    const script = readFileSync(join(root, 'install-autostart.ps1'), 'utf8');
    expect(script).toContain('New-ScheduledTaskTrigger');
    expect(script).toContain('-AtLogOn');
    expect(script).toContain('IsNullOrWhiteSpace($InstallDir)');
    expect(script).toContain('$RuntimeDir');
    expect(script).toContain('conduit-bridge-start.ps1');
    expect(script).toContain('conduit-bridge.out.log');
    expect(script).toContain('conduit-bridge.error.log');
    expect(script).toContain('conduit-bridge.pid');
    expect(script).toContain('Start-Process');
    expect(script).toContain('127.0.0.1:31338');
    expect(script).not.toMatch(/Xvfb|x11vnc|noVNC|websockify|5900|6080/i);

    const uninstall = readFileSync(join(root, 'uninstall-autostart.ps1'), 'utf8');
    expect(uninstall).toContain('Stop-ScheduledTask');
    expect(uninstall).toContain('Unregister-ScheduledTask');
    expect(uninstall).toContain('Stop-Process');
  });
});
