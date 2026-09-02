import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import type { BridgeConfig } from '../src/types.js';

// Redirect the home directory so MetricsStore never writes the real
// ~/.conduit/usage.json while the suite runs. Self-contained, like the factory
// in test/config.test.ts, because vi.mock is hoisted above every const here.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-server-test-home'),
  };
});

// Shared, test-controllable registry behaviour. Defined via vi.hoisted so the
// mock factory (which is hoisted above imports) can reference it safely.
const h = vi.hoisted(() => {
  const grokModel = { id: 'cli-grok/grok-4.5', provider: 'cli-grok', displayName: 'Grok 4.5', owned_by: 'xai' };
  const state = {
    connected: true,      // provider.ensureConnected() result
    chatThrows: false,    // provider.chat() throws when true
    chatError: 'provider exploded',
  };
  return { grokModel, state };
});

// Replace the real ProviderRegistry with a lightweight fake.
vi.mock('../src/registry.js', () => {
  const provider = {
    name: 'cli-grok',
    models: [h.grokModel],
    async ensureConnected() { return h.state.connected; },
    async chat() {
      if (h.state.chatThrows) throw new Error(h.state.chatError);
      return 'mocked completion';
    },
    async *chatStream() { yield 'mocked'; yield ' completion'; },
    async checkSession() { return true; },
    async restoreSession() { return true; },
  };

  class FakeRegistry {
    constructor(public cfg: BridgeConfig) {}
    allModels() { return [h.grokModel]; }
    providerForModel(model: string) {
      return model === h.grokModel.id ? provider : undefined;
    }
    get() { return provider; }
    lookup(name: string) { return name === 'cli-grok' ? provider : undefined; }
    async getStatus() {
      return {
        running: true,
        port: this.cfg.port,
        version: '9.9.9',
        providers: [{ name: 'cli-grok', connected: true, models: [h.grokModel.id], loginType: 'cli' }],
        uptime: 1,
      };
    }
    async refreshApiModels() { return {}; }
  }
  return { ProviderRegistry: FakeRegistry };
});

import { BridgeServer } from '../src/server.js';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

let server: BridgeServer;
let base: string;

beforeAll(async () => {
  const port = await getFreePort();
  const cfg: BridgeConfig = {
    port,
    host: '127.0.0.1',
    logLevel: 'silent',
    apiKeys: {},
  };
  server = new BridgeServer(cfg);
  await server.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.stop();
});

beforeEach(() => {
  h.state.connected = true;
  h.state.chatThrows = false;
  h.state.chatError = 'provider exploded';
});

describe('BridgeServer HTTP handler', () => {
  describe('CORS', () => {
    // Raw request so we can set Origin (fetch strips it as a forbidden header).
    const raw = (path: string, opts: { method?: string; headers?: Record<string, string> } = {}) =>
      new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
        const u = new URL(base + path);
        const req = request(
          { hostname: u.hostname, port: u.port, path: u.pathname, method: opts.method ?? 'GET', headers: opts.headers ?? {} },
          (res) => { res.on('data', () => {}); res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers })); },
        );
        req.on('error', reject);
        req.end();
      });

    it('answers a preflight OPTIONS with 204 and reflects an allowlisted origin', async () => {
      const res = await raw('/v1/chat/completions', { method: 'OPTIONS', headers: { origin: base } });
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(base);
      expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('reflects an allowlisted origin on normal responses and omits foreign origins', async () => {
      const allowed = await raw('/health', { headers: { origin: base } });
      expect(allowed.headers['access-control-allow-origin']).toBe(base);
      expect(allowed.headers['vary']).toBe('Origin');
      const foreign = await raw('/health', { headers: { origin: 'https://evil.example' } });
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('GET /health', () => {
    it('returns an ok status document', async () => {
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('conduit-bridge');
      expect(typeof body.version).toBe('string');
    });
  });

  describe('GET /v1/models', () => {
    it('lists the registered models in OpenAI list shape', async () => {
      const res = await fetch(`${base}/v1/models`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.object).toBe('list');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data[0]).toMatchObject({ id: 'cli-grok/grok-4.5', object: 'model', owned_by: 'xai' });
    });
  });

  describe('GET /v1/status', () => {
    it('returns the registry status snapshot', async () => {
      const res = await fetch(`${base}/v1/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.running).toBe(true);
      expect(Array.isArray(body.providers)).toBe(true);
    });
  });

  describe('POST /v1/chat/completions', () => {
    it('rejects a malformed JSON body with 400', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json{',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request');
      expect(body.error.message).toBe('Invalid JSON');
    });

    it('requires both model and messages (400)', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('model and messages required');
    });

    it('returns 404 for an unknown model', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nope/unknown', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.message).toContain('Unknown model');
    });

    it('completes a non-streaming request through the provider', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.object).toBe('chat.completion');
      expect(body.choices[0].message).toEqual({ role: 'assistant', content: 'mocked completion' });
      expect(body.choices[0].finish_reason).toBe('stop');
    });

    it('returns 503 when the provider is not connected', async () => {
      h.state.connected = false;
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.type).toBe('provider_unavailable');
    });

    it('maps a provider error to 503 provider_error', async () => {
      h.state.chatThrows = true;
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.type).toBe('provider_error');
      expect(body.error.message).toContain('provider exploded');
    });

    it('streams SSE chunks terminated by [DONE] when stream=true', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }], stream: true }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const text = await res.text();
      expect(text).toContain('data: ');
      expect(text).toContain('mocked');
      expect(text).toContain('[DONE]');
    });
  });

  describe('removed browser routes', () => {
    it('does not expose browser login routes', async () => {
      const res = await fetch(`${base}/v1/login/claude-api`, { method: 'POST' });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.type).toBe('not_found');
    });

    it('does not expose browser logout routes', async () => {
      const res = await fetch(`${base}/v1/logout/cli-grok`, { method: 'POST' });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.type).toBe('not_found');
    });
  });

  describe('unknown routes', () => {
    it('returns 404 with a not_found error for an unmapped path', async () => {
      const res = await fetch(`${base}/v1/does-not-exist`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.type).toBe('not_found');
    });

    it('matches routes on path and ignores query strings', async () => {
      expect((await fetch(`${base}/health?ready=1`)).status).toBe(200);
      const models = await fetch(`${base}/v1/models?foo=1`);
      expect(models.status).toBe(200);
      expect((await models.json()).object).toBe('list');
    });
  });

  describe('CSRF vs allowedOrigins', () => {
    const rawPost = (origin: string, site: string, extraOrigins: string[] = []) =>
      new Promise<{ status: number; body: any }>(async (resolve, reject) => {
        const port = await getFreePort();
        const srv = new BridgeServer({
          port,
          host: '127.0.0.1',
          logLevel: 'silent',
          apiKeys: {},
          allowedOrigins: extraOrigins,
        });
        await srv.start();
        const u = new URL(`http://127.0.0.1:${port}/v1/chat/completions`);
        const req = request(
          {
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: {
              origin,
              'sec-fetch-site': site,
              'content-type': 'application/json',
            },
          },
          (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', async () => {
              await srv.stop();
              resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} });
            });
          },
        );
        req.on('error', async err => { await srv.stop(); reject(err); });
        req.end(JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }] }));
      });

    it('allows a same-site POST from an allowlisted origin', async () => {
      const res = await rawPost('http://127.0.0.1:3000', 'same-site', ['http://127.0.0.1:3000']);
      expect(res.status).toBe(200);
    });

    it('rejects a same-site POST from an origin that is not allowlisted', async () => {
      const res = await rawPost('http://127.0.0.1:3000', 'same-site', []);
      expect(res.status).toBe(403);
      expect(res.body.error.type).toBe('forbidden');
    });

    it('rejects a cross-site POST even when Origin is missing', async () => {
      const port = await getFreePort();
      const srv = new BridgeServer({ port, host: '127.0.0.1', logLevel: 'silent', apiKeys: {} });
      await srv.start();
      try {
        const u = new URL(`http://127.0.0.1:${port}/v1/chat/completions`);
        const res = await new Promise<{ status: number }>((resolve, reject) => {
          const req = request(
            {
              hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
              headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
            },
            (r) => { r.on('data', () => {}); r.on('end', () => resolve({ status: r.statusCode ?? 0 })); },
          );
          req.on('error', reject);
          req.end(JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }] }));
        });
        expect(res.status).toBe(403);
      } finally {
        await srv.stop();
      }
    });
  });

  describe('activity redaction and settings', () => {
    it('does not echo credential-shaped tokens in /v1/activity', async () => {
      h.state.chatThrows = true;
      h.state.chatError = 'Unauthorized: invalid API key sk-testvalue99';
      await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }] }),
      });
      const body = await (await fetch(`${base}/v1/activity`)).json();
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain('sk-testvalue99');
      expect(serialised).toContain('[redacted]');
    });

    it('omits API key values from GET /v1/settings', async () => {
      const res = await fetch(`${base}/v1/settings`);
      expect(res.status).toBe(200);
      const body = await res.json();
      const serialised = JSON.stringify(body);
      expect(serialised).not.toMatch(/sk-/);
      expect(body.apiKeys['claude-api']).toMatchObject({ configured: false });
      expect(body.apiKeys['claude-api'].source).toBeDefined();
      expect(body.apiKeys['claude-api']).not.toHaveProperty('key');
    });

    it('returns 404 for an unknown POST /v1/tests/cli provider', async () => {
      const res = await fetch(`${base}/v1/tests/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'not-a-provider' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.type).toBe('not_found');
    });

    it('rate-limits compare and orchestrator fan-out the same way as chat', async () => {
      const port = await getFreePort();
      const srv = new BridgeServer({
        port, host: '127.0.0.1', logLevel: 'silent', apiKeys: {},
        rateLimit: { perMinute: 1, maxConcurrent: 16 },
      });
      await srv.start();
      const root = `http://127.0.0.1:${port}`;
      try {
        const first = await fetch(`${root}/v1/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'x', models: ['cli-grok/grok-4.5'] }),
        });
        expect(first.status).toBe(200);
        const second = await fetch(`${root}/v1/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'y', models: ['cli-grok/grok-4.5'] }),
        });
        expect(second.status).toBe(429);
      } finally {
        await srv.stop();
      }
    });
  });
});
