import { afterEach, expect, it, vi } from 'vitest';
import { notify, notifyCompletion } from '../../src/skills/notify.js';
import { skillContext } from './addendum-context.js';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('defaults to log-only and requires host configuration for delivery', async () => {
  vi.stubEnv('CONDUIT_NOTIFY_WEBHOOK_URL', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await notify('done', 'webhook')).toEqual({ channel: 'log', delivered: true }); expect(fetch).not.toHaveBeenCalled();
});
it('uses a fixed HTTPS destination without redirects and never returns failure response content', async () => {
  vi.stubEnv('CONDUIT_NOTIFY_WEBHOOK_URL', 'https://notify.example/hook');
  const fetch = vi.fn(async () => new Response('private diagnostic text', { status: 400 })); vi.stubGlobal('fetch', fetch);
  await expect(notify('done', 'webhook')).rejects.toThrow('delivery failed'); expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'POST' });
  vi.stubEnv('CONDUIT_NOTIFY_WEBHOOK_URL', 'http://notify.example'); await expect(notify('done', 'webhook')).rejects.toThrow('HTTPS');
});
it('requires mutation authorization before webhook delivery', async () => {
  const context = skillContext('.'); context.authorize = () => { throw new Error('denied'); };
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(notifyCompletion('done', 'webhook', context)).rejects.toThrow('denied'); expect(fetch).not.toHaveBeenCalled();
});
