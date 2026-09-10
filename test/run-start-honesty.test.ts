import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHttpChatClient } from '../src/interactive-cli.js';

/**
 * createRun used to answer `run-${Date.now()}` whenever the request failed, on
 * every path including a rejected fallback. A run that never started therefore
 * produced an identifier, the composer reported "Started run ...", and every
 * later poll for that id quietly found nothing.
 *
 * That is the failure direction nobody notices: it reports success rather than
 * blocking. runAction had the same shape, an empty catch, so a refused approval
 * and a granted one were indistinguishable.
 */

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});

/** Starts a server that answers every request with `status` and `body`. */
async function serving(status: number, body: unknown): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || !address) throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

describe('createRun never invents an identifier', () => {
  it('throws when both endpoints refuse, instead of answering a made-up id', async () => {
    const client = createHttpChatClient(await serving(403, { error: 'The run owner is no longer authorized' }));
    await expect(client.createRun('tu etwas')).rejects.toThrow(/could not be started/i);
  });

  it('throws when the response carries no id, rather than fabricating one', async () => {
    // A 200 with the wrong shape is the quieter version of the same bug.
    const client = createHttpChatClient(await serving(200, { ok: true }));
    await expect(client.createRun('tu etwas')).rejects.toThrow(/no run id/i);
  });

  it('rejects an id that is not a string, rather than passing it into a URL', async () => {
    // Without a shape check this returns 12345, which is then interpolated into
    // /v1/runs/12345/approve and fails much later, far from the cause.
    const client = createHttpChatClient(await serving(202, { run: { id: 12345 } }));
    await expect(client.createRun('tu etwas')).rejects.toThrow(/no run id/i);
  });

  it('rejects an empty-string id, which is falsy but still a string', async () => {
    const client = createHttpChatClient(await serving(202, { id: '' }));
    await expect(client.createRun('tu etwas')).rejects.toThrow(/no run id/i);
  });

  it('never answers an identifier of the fabricated shape', async () => {
    const client = createHttpChatClient(await serving(500, { error: 'boom' }));
    const result = await client.createRun('tu etwas').catch(err => err);
    expect(result).toBeInstanceOf(Error);
    expect(String((result as { id?: string }).id ?? '')).not.toMatch(/^run-\d+$/);
  });

  it('control: a well-formed response still yields its real id', async () => {
    // Without this the assertions above would also hold for a function that
    // always throws, which would be a different bug.
    const client = createHttpChatClient(await serving(202, { run: { id: 'run-echt-42' } }));
    await expect(client.createRun('tu etwas')).resolves.toEqual({ id: 'run-echt-42' });
  });

  it('control: a top-level id is accepted too, since both shapes are served', async () => {
    const client = createHttpChatClient(await serving(202, { id: 'run-flach-7' }));
    await expect(client.createRun('tu etwas')).resolves.toEqual({ id: 'run-flach-7' });
  });
});

describe('runAction reports a refusal instead of swallowing it', () => {
  it('throws when both endpoints refuse the action', async () => {
    const client = createHttpChatClient(await serving(403, { error: 'not authorized' }));
    await expect(client.runAction('run-1', 'approve')).rejects.toThrow(/refused/i);
  });

  it('control: an accepted action resolves quietly', async () => {
    const client = createHttpChatClient(await serving(200, { ok: true }));
    await expect(client.runAction('run-1', 'approve')).resolves.toBeUndefined();
  });
});
