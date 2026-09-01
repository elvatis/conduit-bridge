import { describe, expect, it } from 'vitest';
import { detectDefaultBrowser } from '../src/login/browser-discovery.js';

describe('default browser discovery', () => {
  it('detects the Windows Edge handler and its native profile root', () => {
    const browser = detectDefaultBrowser({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\Emre\\AppData\\Local' },
      run: (file, args) => {
        if (file !== 'reg.exe') return '';
        if (args.includes('ProgId')) return '    ProgId    REG_SZ    MSEdgeHTM\r\n';
        return '    (Default)    REG_SZ    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --single-argument %1\r\n';
      },
      exists: path => path.endsWith('msedge.exe'),
    });
    expect(browser).toMatchObject({
      name: 'MSEdgeHTM',
      family: 'chromium',
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      userDataDir: 'C:\\Users\\Emre\\AppData\\Local\\Microsoft\\Edge\\User Data',
      supported: true,
    });
  });

  it('detects a Linux Firefox default and explains the CDP limitation', () => {
    const browser = detectDefaultBrowser({
      platform: 'linux',
      env: { HOME: '/home/emre', XDG_DATA_HOME: '/home/emre/.local/share' },
      run: (file, args) => file === 'xdg-settings' && args[0] === 'get' ? 'firefox.desktop\n' : '',
      exists: path => path === '/home/emre/.local/share/applications/firefox.desktop',
      readFile: () => '[Desktop Entry]\nExec=/usr/bin/firefox %u\nName=Firefox\n',
    });
    expect(browser).toMatchObject({ family: 'firefox', supported: false });
    expect(browser.reason).toMatch(/Chromium-based/i);
  });
});
