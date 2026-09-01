import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, type Browser, type BrowserContext } from 'playwright';

export interface RestoreBrowserOptions {
  executablePath: string;
  profileDirPath: string;
  env: NodeJS.ProcessEnv;
  windowSize?: { width: number; height: number };
  noSandbox?: boolean;
  connectTimeoutMs?: number;
  /** Initial page. Defaults to about:blank for unattended restore. */
  initialUrl?: string;
}

export interface RestoreBrowserIdentity {
  webdriver: boolean;
  userAgent: string;
  platform: string;
}

export interface AttachedRestoreBrowser {
  browser: Browser;
  context: BrowserContext;
  child: ChildProcess;
  cdpPort: number;
  identity: RestoreBrowserIdentity;
  close(): Promise<void>;
}

export function restoreBrowserArgs(
  opts: Pick<RestoreBrowserOptions, 'profileDirPath' | 'windowSize' | 'noSandbox' | 'initialUrl'>,
  cdpPort: number,
): string[] {
  const size = opts.windowSize ?? { width: 1400, height: 900 };
  const args = [
    `--user-data-dir=${opts.profileDirPath}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    `--window-size=${size.width},${size.height}`,
    '--window-position=0,0',
    opts.initialUrl ?? 'about:blank',
  ];
  if (opts.noSandbox) args.splice(args.length - 1, 0, '--no-sandbox');
  return args;
}

/** Reserve an unused loopback port for Chromium's private CDP listener. */
async function availableLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(err => err ? reject(err) : resolve(port));
    });
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Start an ordinary, headed Chromium process and attach Playwright afterwards.
 *
 * Playwright's own launcher enables an automation transport that makes
 * navigator.webdriver true. A fixed, loopback-only DevTools port on a browser
 * started without --enable-automation keeps the browser identity truthful while
 * still giving Conduit the BrowserContext it needs for provider requests.
 */
export async function launchAttachedRestoreBrowser(opts: RestoreBrowserOptions): Promise<AttachedRestoreBrowser> {
  const cdpPort = await availableLoopbackPort();
  const args = restoreBrowserArgs(opts, cdpPort);

  const child = spawn(opts.executablePath, args, {
    env: opts.env,
    stdio: 'ignore',
    detached: false,
  });
  let spawnError: Error | null = null;
  child.once('error', err => { spawnError = err; });

  const deadline = Date.now() + (opts.connectTimeoutMs ?? 12_000);
  let browser: Browser | null = null;
  let lastError: unknown = null;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null && !spawnError) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 700 });
      break;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  if (!browser) {
    child.kill('SIGTERM');
    await waitForExit(child, 1500);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    const recordedSpawnError = spawnError as Error | null;
    const detail = recordedSpawnError?.message ?? (lastError instanceof Error ? lastError.message : 'browser exited before CDP was ready');
    throw new Error(`Could not attach to the restore browser: ${detail}`);
  }

  const context = browser.contexts()[0];
  if (!context) {
    await browser.close().catch(() => {});
    child.kill('SIGTERM');
    throw new Error('The restore browser exposed no persistent context.');
  }
  const page = context.pages()[0] ?? await context.newPage();
  const identity = await page.evaluate(() => ({
    webdriver: (navigator as Navigator & { webdriver?: boolean }).webdriver === true,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  }));

  let closed = false;
  return {
    browser,
    context,
    child,
    cdpPort,
    identity,
    close: async () => {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => {});
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await waitForExit(child, 1500);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    },
  };
}
