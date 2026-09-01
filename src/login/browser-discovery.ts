// Detect the user's default desktop browser and its native profile location.
// This is intentionally limited to local desktop discovery. Browser profile
// reuse is only safe when the browser is started as the same OS user.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, win32 } from 'node:path';

export type BrowserFamily = 'chromium' | 'firefox' | 'unknown';

export interface DefaultBrowser {
  name: string;
  family: BrowserFamily;
  executablePath: string | null;
  userDataDir: string | null;
  supported: boolean;
  reason?: string;
}

export interface BrowserDiscoveryDeps {
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  run?: (file: string, args: string[]) => string;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
}

function defaultRun(file: string, args: string[]): string {
  try {
    return execFileSync(file, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function expandWindowsPath(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (_match, key: string) => env[key] ?? `%${key}%`);
}

function commandExecutable(command: string, env: NodeJS.ProcessEnv): string | null {
  const trimmed = command.trim();
  const quoted = /^"([^"]+)"/.exec(trimmed)?.[1];
  const token = quoted ?? (/^([^\s]+\.exe)/i.exec(trimmed)?.[1] ?? trimmed.split(/\s+/)[0]);
  if (!token) return null;
  return expandWindowsPath(token, env);
}

function familyFor(name: string, executablePath: string | null): BrowserFamily {
  const value = `${name} ${executablePath ?? ''}`.toLowerCase();
  if (/firefox/.test(value)) return 'firefox';
  if (/edge|msedge|brave|chrome|chromium/.test(value)) return 'chromium';
  return 'unknown';
}

function profileFor(name: string, family: BrowserFamily, platform: string, env: NodeJS.ProcessEnv): string | null {
  if (family !== 'chromium') return null;
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    if (!local) return null;
    const value = name.toLowerCase();
    if (value.includes('edge')) return win32.join(local, 'Microsoft', 'Edge', 'User Data');
    if (value.includes('brave')) return win32.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data');
    if (value.includes('chrom')) return win32.join(local, 'Google', 'Chrome', 'User Data');
    return null;
  }
  if (platform === 'linux') {
    const home = env.HOME || homedir();
    const value = name.toLowerCase();
    if (value.includes('edge')) return join(home, '.config', 'microsoft-edge');
    if (value.includes('brave')) return join(home, '.config', 'BraveSoftware', 'Brave-Browser');
    if (value.includes('chromium')) return join(home, '.config', 'chromium');
    if (value.includes('chrom')) return join(home, '.config', 'google-chrome');
  }
  return null;
}

function unsupported(name: string, family: BrowserFamily, executablePath: string | null, userDataDir: string | null): DefaultBrowser {
  return {
    name,
    family,
    executablePath,
    userDataDir,
    supported: family === 'chromium' && Boolean(executablePath),
    ...(family !== 'chromium' ? { reason: `${name} is the default browser, but only Chromium-based desktop browsers are supported for profile attachment.` } : {}),
  };
}

function detectWindows(deps: Required<Pick<BrowserDiscoveryDeps, 'run' | 'exists'>> & BrowserDiscoveryDeps): DefaultBrowser {
  const env = deps.env ?? process.env;
  const choice = deps.run('reg.exe', [
    'query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId',
  ]);
  const progId = /ProgId\s+REG_SZ\s+([^\r\n]+)/i.exec(choice)?.[1]?.trim() ?? '';
  const command = progId
    ? deps.run('reg.exe', ['query', `HKCR\\${progId}\\shell\\open\\command`, '/ve'])
    : '';
  const commandLine = command.split(/\r?\n/).find(line => /REG_SZ/i.test(line))?.replace(/^.*?REG_SZ\s+/i, '') ?? '';
  const executablePath = commandExecutable(commandLine, env);
  const name = progId || basename(executablePath ?? 'unknown browser', '.exe');
  const family = familyFor(name, executablePath);
  const executable = executablePath && deps.exists(executablePath) ? executablePath : null;
  return unsupported(name, family, executable, profileFor(name, family, 'win32', env));
}

function detectLinux(deps: Required<Pick<BrowserDiscoveryDeps, 'run' | 'exists' | 'readFile'>> & BrowserDiscoveryDeps): DefaultBrowser {
  const env = deps.env ?? process.env;
  const desktopId = deps.run('xdg-settings', ['get', 'default-web-browser']).trim();
  const dataHome = env.XDG_DATA_HOME || join(env.HOME || homedir(), '.local', 'share');
  const candidates = [
    join(dataHome, 'applications', desktopId),
    join('/usr/local/share/applications', desktopId),
    join('/usr/share/applications', desktopId),
  ];
  const desktopFile = candidates.find(path => desktopId && deps.exists(path));
  const desktop = desktopFile ? deps.readFile(desktopFile) : '';
  const execLine = desktop.split(/\r?\n/).find(line => /^Exec=/.test(line))?.slice(5).trim() ?? '';
  const executablePath = execLine ? execLine.match(/^(?:"([^"]+)"|([^\s]+))/)?.slice(1).find(Boolean) ?? null : null;
  const name = desktopId.replace(/\.desktop$/i, '') || basename(executablePath ?? 'unknown browser');
  const family = familyFor(`${name} ${desktop}`, executablePath);
  return unsupported(name, family, executablePath, profileFor(name, family, 'linux', env));
}

export function detectDefaultBrowser(deps: BrowserDiscoveryDeps = {}): DefaultBrowser {
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? defaultRun;
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((path: string) => {
    try { return readFileSync(path, 'utf8'); } catch { return ''; }
  });
  if (platform === 'win32') return detectWindows({ ...deps, platform, run, exists });
  if (platform === 'linux') return detectLinux({ ...deps, platform, run, exists, readFile });
  return {
    name: platform,
    family: 'unknown',
    executablePath: null,
    userDataDir: null,
    supported: false,
    reason: 'Default browser discovery is currently implemented for Windows Desktop and Linux Desktop.',
  };
}
