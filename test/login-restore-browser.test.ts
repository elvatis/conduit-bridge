import { describe, expect, it } from 'vitest';
import { restoreBrowserArgs } from '../src/login/restore-browser.js';

describe('attached restore browser launch', () => {
  it('uses a fixed loopback CDP endpoint without automation identity flags', () => {
    const args = restoreBrowserArgs({ profileDirPath: '/tmp/conduit-profile' }, 43123);

    expect(args).toContain('--remote-debugging-address=127.0.0.1');
    expect(args).toContain('--remote-debugging-port=43123');
    expect(args).not.toContain('--remote-debugging-port=0');
    expect(args).not.toContain('--enable-automation');
    expect(args.join(' ')).not.toContain('AutomationControlled');
    expect(args.join(' ')).not.toContain('user-agent');
    expect(args).not.toContain('--headless');
  });

  it('adds no-sandbox only when explicitly requested', () => {
    expect(restoreBrowserArgs({ profileDirPath: '/tmp/a' }, 43124)).not.toContain('--no-sandbox');
    expect(restoreBrowserArgs({ profileDirPath: '/tmp/a', noSandbox: true }, 43124)).toContain('--no-sandbox');
  });
});
