import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const codexModel = { id: 'cli-codex/gpt-test', provider: 'cli-codex', displayName: 'Codex Test', owned_by: 'openai' };
  const state = {
    connected: true,      // provider.ensureConnected() result
    chatThrows: false,    // provider.chat() throws when true
    chatError: 'provider exploded',
    lastReq: undefined as { mode?: string; cwd?: string } | undefined,
    lastProvider: undefined as string | undefined,
  };
  return { grokModel, codexModel, state };
});

// Replace the real ProviderRegistry with a lightweight fake.
vi.mock('../src/registry.js', () => {
  const makeProvider = (name: string, model: typeof h.grokModel) => ({
    name,
    models: [model],
    async ensureConnected() { return h.state.connected; },
    async chat(req: { mode?: string; cwd?: string }) {
      h.state.lastReq = req;
      h.state.lastProvider = name;
      if (h.state.chatThrows && name === 'cli-grok') throw new Error(h.state.chatError);
      return 'mocked completion';
    },
    async *chatStream() { yield 'mocked'; yield ' completion'; },
    async checkSession() { return true; },
    async restoreSession() { return true; },
  });
  const grokProvider = makeProvider('cli-grok', h.grokModel);
  const codexProvider = makeProvider('cli-codex', h.codexModel);

  class FakeRegistry {
    constructor(public cfg: BridgeConfig) {}
    allModels() { return [h.grokModel, h.codexModel]; }
    providerForModel(model: string) {
      return model === h.grokModel.id ? grokProvider : model === h.codexModel.id ? codexProvider : undefined;
    }
    get(name: string) { return name === 'cli-codex' ? codexProvider : grokProvider; }
    lookup(name: string) { return name === 'cli-grok' ? grokProvider : name === 'cli-codex' ? codexProvider : undefined; }
    async getStatus() {
      return {
        running: true,
        port: this.cfg.port,
        version: '9.9.9',
        providers: [
          { name: 'cli-grok', connected: true, models: [h.grokModel.id], loginType: 'cli' },
          { name: 'cli-codex', connected: true, models: [h.codexModel.id], loginType: 'cli' },
        ],
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
  h.state.lastReq = undefined;
  h.state.lastProvider = undefined;
});

describe('BridgeServer HTTP handler', () => {
  describe('CORS', () => {
    // Raw request so we can set Origin (fetch strips it as a forbidden header).
    const raw = (path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
      new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
        const u = new URL(base + path);
        const req = request(
          { hostname: u.hostname, port: u.port, path: u.pathname, method: opts.method ?? 'GET', headers: opts.headers ?? {} },
          (res) => { res.on('data', () => {}); res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers })); },
        );
        req.on('error', reject);
        req.end(opts.body);
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

    it('rejects opaque origins on state-changing requests', async () => {
      const res = await raw('/v1/settings/agent-policy', {
        method: 'POST',
        headers: { origin: 'null', 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'cli-grok', agentEnabled: true }),
      });
      expect(res.status).toBe(403);
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

    it('sets browser hardening headers', async () => {
      const res = await fetch(`${base}/health`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });
  });

  describe('request body limits', () => {
    it('rejects an oversized declared body before reading it', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'x'.repeat(1_048_577),
      });
      expect(res.status).toBe(413);
      expect((await res.json()).error.type).toBe('request_too_large');
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
      expect(body.data[0].capabilities).toMatchObject({ modes: ['chat', 'plan', 'agent'], streaming: 'turn', nativeResume: true, local: false });
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

    it('rejects an unknown mode with 400', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }], mode: 'yolo' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/chat, plan, or agent/i);
    });

    it('rejects agent mode without an absolute existing cwd', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }], mode: 'agent' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/cwd/i);
    });

    it('forwards plan mode to the provider', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-grok/grok-4.5', messages: [{ role: 'user', content: 'hi' }], mode: 'plan' }),
      });
      expect(res.status).toBe(200);
      expect(h.state.lastReq?.mode).toBe('plan');
    });

    it('accepts agentic: true as agent when cwd is valid', async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'cli-grok/grok-4.5',
          messages: [{ role: 'user', content: 'hi' }],
          agentic: true,
          cwd: process.cwd(),
        }),
      });
      expect(res.status).toBe(200);
      expect(h.state.lastReq?.mode).toBe('agent');
      expect(h.state.lastReq?.cwd).toBe(process.cwd());
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

    it('manages and enforces agent policy per provider', async () => {
      // 1. GET initial agent policies
      const getRes = await fetch(`${base}/v1/settings/agent-policy`);
      expect(getRes.status).toBe(200);
      const initial = await getRes.json();
      expect(initial.policies['cli-grok']).toMatchObject({
        provider: 'cli-grok',
        hasAgentCapability: true,
        agentEnabled: true,
      });
      expect(initial.policies['claude-api']).toMatchObject({
        provider: 'claude-api',
        hasAgentCapability: false,
        agentEnabled: false,
      });

      // 2. Reject enabling agent mode on non-CLI provider
      const badApiRes = await fetch(`${base}/v1/settings/agent-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'claude-api', agentEnabled: true }),
      });
      expect(badApiRes.status).toBe(400);

      const injectedPolicy = await fetch(`${base}/v1/settings/agent-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'cli-grok',
          agentEnabled: true,
          disallowedTools: 'Write"&echo injected&rem "',
        }),
      });
      expect(injectedPolicy.status).toBe(400);
      expect((await injectedPolicy.json()).error.type).toBe('invalid_request');

      // 3. Disable agent mode and set defaultMode to plan for cli-grok
      const postRes = await fetch(`${base}/v1/settings/agent-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'cli-grok',
          agentEnabled: false,
          defaultMode: 'plan',
          disallowedTools: 'Write,Edit',
        }),
      });
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.status).toBe('saved');
      expect(postBody.policy).toMatchObject({
        agentEnabled: false,
        defaultMode: 'plan',
        disallowedTools: 'Write,Edit',
      });

      // 4. Verify agent mode request is refused with 403 permission_denied
      const agentAttempt = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'cli-grok/grok-4.5',
          messages: [{ role: 'user', content: 'hello' }],
          mode: 'agent',
          cwd: process.cwd(),
        }),
      });
      expect(agentAttempt.status).toBe(403);
      const agentErr = await agentAttempt.json();
      expect(agentErr.error.type).toBe('permission_denied');
      expect(agentErr.error.message).toContain('disabled for provider');

      // 5. Unspecified mode applies defaultMode from policy (plan)
      const defaultModeRes = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'cli-grok/grok-4.5',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      });
      expect(defaultModeRes.status).toBe(200);
      expect(h.state.lastReq?.mode).toBe('plan');

      // 6. Re-enable agent mode
      await fetch(`${base}/v1/settings/agent-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'cli-grok',
          agentEnabled: true,
          defaultMode: 'chat',
        }),
      });
      const reenabledRes = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'cli-grok/grok-4.5',
          messages: [{ role: 'user', content: 'hello' }],
          mode: 'agent',
          cwd: process.cwd(),
        }),
      });
      expect(reenabledRes.status).toBe(200);
      expect(h.state.lastReq?.mode).toBe('agent');
    });

    it('does not bypass agent policy when falling back to another provider', async () => {
      await fetch(`${base}/v1/settings/agent-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'cli-codex', agentEnabled: false, defaultMode: 'chat' }),
      });
      h.state.chatThrows = true;
      try {
        const res = await fetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'cli-grok/grok-4.5',
            fallback_models: ['cli-codex/gpt-test'],
            messages: [{ role: 'user', content: 'hello' }],
            mode: 'agent',
            cwd: process.cwd(),
          }),
        });
        expect(res.status).toBe(503);
        expect(h.state.lastProvider).toBe('cli-grok');
      } finally {
        h.state.chatThrows = false;
        await fetch(`${base}/v1/settings/agent-policy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'cli-codex', agentEnabled: true, defaultMode: 'chat' }),
        });
      }
    });
  });

  describe('pipeline and tool management endpoints', () => {
    it('GET /v1/tools returns categorized tool catalogue', async () => {
      const res = await fetch(`${base}/v1/tools`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.object).toBe('list');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(20);
      const bash = data.data.find((t: any) => t.name === 'Bash');
      expect(bash).toBeDefined();
      expect(bash.category).toBe('Shell / Terminal');
    });

    it('GET /v1/pipelines returns default pipelines', async () => {
      const res = await fetch(`${base}/v1/pipelines`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.object).toBe('list');
      expect(data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('POST and DELETE /v1/pipelines creates and removes custom pipeline', async () => {
      const createRes = await fetch(`${base}/v1/pipelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'test-pipe-custom',
          name: 'Custom Pipeline Endpoint Test',
          description: 'Testing endpoints',
          steps: [
            { id: 's1', name: 'Step 1', model: 'cli-grok/grok-4.5' },
          ],
        }),
      });
      expect(createRes.status).toBe(200);
      const createBody = await createRes.json();
      expect(createBody.status).toBe('saved');
      expect(createBody.pipeline.name).toBe('Custom Pipeline Endpoint Test');

      const delRes = await fetch(`${base}/v1/pipelines/test-pipe-custom`, {
        method: 'DELETE',
      });
      expect(delRes.status).toBe(200);
      const delBody = await delRes.json();
      expect(delBody.status).toBe('deleted');
    });

    it('POST /v1/pipelines/run executes a pipeline run', async () => {
      const runRes = await fetch(`${base}/v1/pipelines/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineId: 'tri-vendor-review',
          prompt: 'Review architecture',
        }),
      });
      expect(runRes.status).toBe(202);
      const runData = await runRes.json();
      expect(runData.status).toBe('accepted');
      expect(runData.run).toBeDefined();
      expect(runData.run.pipelineId).toBe('tri-vendor-review');

      const detailRes = await fetch(`${base}/v1/pipelines/runs/${encodeURIComponent(runData.run.id)}`);
      expect(detailRes.status).toBe(200);
      expect((await detailRes.json()).run.id).toBe(runData.run.id);

      const historyRes = await fetch(`${base}/v1/pipelines/runs`);
      expect(historyRes.status).toBe(200);
      const history = await historyRes.json();
      expect(history.data.length).toBeGreaterThanOrEqual(1);
    });

    it('enforces repository pipeline allowlists', async () => {
      const res = await fetch(`${base}/v1/pipelines/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineId: 'doc-review',
          prompt: 'Review documentation',
          repository: 'elvatis/conduit-bridge',
          workingDirectory: process.cwd(),
        }),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error.type).toBe('permission_denied');
    });

    it('rejects an unregistered working directory', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'conduit-unregistered-'));
      try {
        const res = await fetch(`${base}/v1/pipelines/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipelineId: 'tri-vendor-review',
            prompt: 'Review architecture',
            workingDirectory: outside,
          }),
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error.message).toMatch(/outside every registered/i);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('creates, lists, gets, and cancels chat sessions via /v1/chat/sessions', async () => {
      const createRes = await fetch(`${base}/v1/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'cli-codex/gpt-5.6-sol', title: 'Test Session' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toMatch(/^session-/);
      expect(created.model).toBe('cli-codex/gpt-5.6-sol');
      expect(created.title).toBe('Test Session');

      const listRes = await fetch(`${base}/v1/chat/sessions`);
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      expect(Array.isArray(list.data)).toBe(true);
      expect(list.data.some((s: any) => s.id === created.id)).toBe(true);

      const getRes = await fetch(`${base}/v1/chat/sessions/${created.id}`);
      expect(getRes.status).toBe(200);
      const fetched = await getRes.json();
      expect(fetched.id).toBe(created.id);
      expect(fetched.title).toBe('Test Session');

      const cancelRes = await fetch(`${base}/v1/chat/sessions/${created.id}/cancel`, {
        method: 'POST',
      });
      expect(cancelRes.status).toBe(200);
      expect((await cancelRes.json()).cancelled).toBe(true);
    });

    it('returns system status and advertised providers via /v1/system/status', async () => {
      const res = await fetch(`${base}/v1/system/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.version).toBeDefined();
      expect(Array.isArray(body.providers)).toBe(true);
      expect(body.providers.some((p: any) => p.name === 'cli-grok')).toBe(true);
    });
  });
});
