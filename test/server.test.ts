import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import type { BridgeConfig } from '../src/types.js';

// Shared, test-controllable registry behaviour. Defined via vi.hoisted so the
// mock factory (which is hoisted above imports) can reference it safely.
const h = vi.hoisted(() => {
  const grokModel = { id: 'web-grok/grok-fast', provider: 'grok', displayName: 'Grok Fast', owned_by: 'xai' };
  const state = {
    connected: true,      // provider.ensureConnected() result
    chatThrows: false,    // provider.chat() throws when true
    loginCalls: [] as string[],
    logoutCalls: [] as string[],
  };
  return { grokModel, state };
});

// Replace the real ProviderRegistry (which would construct Playwright/SDK
// providers) with a lightweight fake. No browser is ever launched.
vi.mock('../src/registry.js', () => {
  const provider = {
    name: 'grok',
    models: [h.grokModel],
    async ensureConnected() { return h.state.connected; },
    async chat() {
      if (h.state.chatThrows) throw new Error('provider exploded');
      return 'mocked completion';
    },
    async *chatStream() { yield 'mocked'; yield ' completion'; },
    async login(onReady: (url: string) => void) { h.state.loginCalls.push('grok'); onReady('https://grok.com'); },
    async logout() { h.state.logoutCalls.push('grok'); },
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
    async getStatus() {
      return {
        running: true,
        port: this.cfg.port,
        version: '9.9.9',
        providers: [{ name: 'grok', connected: true, hasProfile: false, sessionValid: true, models: [h.grokModel.id] }],
        uptime: 1,
      };
    }
    async restoreSessions() { /* no-op */ }
    async keepaliveSessions() { /* no-op */ }
    get isRestoring() { return false; }
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
    profileBaseDir: '/tmp/conduit-test-profiles',
    headless: true,
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
  h.state.loginCalls = [];
  h.state.logoutCalls = [];
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
      expect(body.data[0]).toMatchObject({ id: 'web-grok/grok-fast', object: 'model', owned_by: 'xai' });
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
        body: JSON.stringify({ model: 'web-grok/grok-fast' }),
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
        body: JSON.stringify({ model: 'web-grok/grok-fast', messages: [{ role: 'user', content: 'hi' }] }),
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
        body: JSON.stringify({ model: 'web-grok/grok-fast', messages: [{ role: 'user', content: 'hi' }] }),
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
        body: JSON.stringify({ model: 'web-grok/grok-fast', messages: [{ role: 'user', content: 'hi' }] }),
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
        body: JSON.stringify({ model: 'web-grok/grok-fast', messages: [{ role: 'user', content: 'hi' }], stream: true }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const text = await res.text();
      expect(text).toContain('data: ');
      expect(text).toContain('mocked');
      expect(text).toContain('[DONE]');
    });
  });

  describe('login / logout routes', () => {
    it('rejects browser login for API-key providers with 400', async () => {
      const res = await fetch(`${base}/v1/login/claude-api`, { method: 'POST' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.status).toBe('error');
      expect(body.message).toContain('API keys');
    });

    it('starts browser login for a web provider with 202', async () => {
      const res = await fetch(`${base}/v1/login/grok`, { method: 'POST' });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.status).toBe('login_started');
      expect(body.provider).toBe('grok');
    });

    it('logs out a provider with 200', async () => {
      const res = await fetch(`${base}/v1/logout/grok`, { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(h.state.logoutCalls).toContain('grok');
    });
  });

  describe('unknown routes', () => {
    it('returns 404 with a not_found error for an unmapped path', async () => {
      const res = await fetch(`${base}/v1/does-not-exist`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.type).toBe('not_found');
    });
  });
});
