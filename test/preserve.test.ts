import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import type { BridgeConfig } from '../src/types.js';

// Regression-preservation suite. Everything asserted here already shipped
// before the browser-login work; a failure means that work broke something
// unrelated to logging in. Assertions pin CURRENT behaviour, not intent.

// Redirect the home directory so MetricsStore, RunHistory and saveConfig never
// touch the real ~/.conduit while the suite runs. Self-contained because
// vi.mock is hoisted above every const in this file.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), 'conduit-bridge-preserve-test-home'),
  };
});

const h = vi.hoisted(() => {
  // Markers let the activity-journal test prove that neither the prompt nor
  // the completion text ever reaches the operational log.
  const PROMPT_MARKER = 'preserve-prompt-marker-91f2';
  const REPLY_MARKER = 'preserve-reply-marker-44ad';
  const primaryModel = {
    id: 'web-grok/grok-fast', provider: 'grok', displayName: 'Grok Fast',
    owned_by: 'xai', availability: 'verified', source: 'catalog',
  };
  // Deliberately carries neither availability nor source, so /v1/models has to
  // apply its documented defaults.
  const fallbackModel = {
    id: 'api-openrouter/acme/fallback-model', provider: 'openrouter-api',
    displayName: 'Fallback Model', owned_by: 'acme',
  };
  const state = {
    connected: true,
    primaryFails: false,
    hangUntilAbort: false,
    chatCalls: 0,
    abortObserved: false,
    signalSeen: false,
    embeddingsModelSeen: null as string | null,
  };
  return { PROMPT_MARKER, REPLY_MARKER, primaryModel, fallbackModel, state };
});

// Lightweight stand-in for the real ProviderRegistry: no Playwright, no SDKs,
// no network. The fake records whether the AbortSignal it was handed fired.
vi.mock('../src/registry.js', () => {
  const makeProvider = (name: string, models: unknown[]) => ({
    name,
    models,
    async ensureConnected() { return h.state.connected; },
    async checkSession() { return h.state.connected; },
    async restoreSession() { return true; },
    async login(onReady: (url: string) => void) { onReady('https://example.invalid/login'); },
    async logout() { /* no-op */ },
    async chat(req: { model: string; signal?: AbortSignal }) {
      h.state.chatCalls++;
      h.state.signalSeen = Boolean(req.signal);
      if (h.state.hangUntilAbort) {
        // Never settles on its own: the only exit is the AbortSignal the server
        // must hand down when the HTTP client disconnects.
        return await new Promise<string>((_resolve, reject) => {
          const signal = req.signal;
          if (!signal) { reject(new Error('provider.chat received no AbortSignal')); return; }
          const onAbort = () => { h.state.abortObserved = true; reject(new Error('request aborted')); };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        });
      }
      if (h.state.primaryFails && req.model === h.primaryModel.id) throw new Error('primary model exploded');
      return `${h.REPLY_MARKER} answer from ${req.model}`;
    },
    async *chatStream(req: { model: string }) {
      yield `${h.REPLY_MARKER} `;
      yield `stream from ${req.model}`;
    },
  });

  const grok = makeProvider('grok', [h.primaryModel]);
  const openrouter = {
    ...makeProvider('openrouter-api', [h.fallbackModel]),
    async embeddings(_input: string | string[], model: string) {
      h.state.embeddingsModelSeen = model;
      return {
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      };
    },
  };

  class FakeRegistry {
    constructor(public cfg: BridgeConfig) {}
    allModels() { return [h.primaryModel, h.fallbackModel]; }
    providerForModel(model: string) {
      if (model === h.primaryModel.id) return grok;
      // Mirrors OpenRouterApiProvider.ownsModel: the whole namespace routes here.
      if (model.startsWith('api-openrouter/')) return openrouter;
      return undefined;
    }
    get() { return grok; }
    async getStatus() {
      return {
        running: true,
        port: this.cfg.port,
        version: '9.9.9',
        providers: [
          { name: 'grok', connected: true, hasProfile: true, sessionValid: true, models: [h.primaryModel.id], loginType: 'browser' },
          { name: 'openrouter-api', connected: true, hasProfile: false, sessionValid: true, models: [h.fallbackModel.id], loginType: 'api-key' },
        ],
        uptime: 1,
      };
    }
    async restoreSessions() { /* no-op */ }
    async keepaliveSessions() { /* no-op */ }
    async refreshApiModels() { return {}; }
    get isRestoring() { return false; }
  }
  return { ProviderRegistry: FakeRegistry };
});

import { BridgeServer } from '../src/server.js';
import { DASHBOARD_HTML, HELP_HTML } from '../src/dashboard.js';

const PRIMARY = h.primaryModel.id;
const FALLBACK = h.fallbackModel.id;
// Short on purpose so the repo secret scanner (20+ char assigned secrets) stays quiet.
const AUTH_TOKEN = 'preserve-tkn';
const TEST_HOME = join(tmpdir(), 'conduit-bridge-preserve-test-home');

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

function config(port: number, extra: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    port,
    host: '127.0.0.1',
    profileBaseDir: join(TEST_HOME, '.conduit', 'profiles'),
    headless: true,
    logLevel: 'silent',
    apiKeys: {},
    ...extra,
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string, budgetMs = 3000): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await sleep(10);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * Minimal WebSocket client: performs the upgrade by hand and decodes the
 * server's unmasked text frames. Enough to prove the /v1/events contract
 * without pulling a ws dependency into the suite.
 */
function openEventSocket(baseUrl: string): Promise<{ messages: unknown[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl);
    const req = request({
      hostname: u.hostname,
      port: u.port,
      path: '/v1/events',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('error', reject);
    req.on('upgrade', (_res, socket: Duplex, head: Buffer) => {
      const messages: unknown[] = [];
      let buf = head?.length ? Buffer.from(head) : Buffer.alloc(0);
      const drain = () => {
        while (buf.length >= 2) {
          const opcode = buf[0] & 0x0f;
          let len = buf[1] & 0x7f;
          let offset = 2;
          if (len === 126) {
            if (buf.length < 4) return;
            len = buf.readUInt16BE(2); offset = 4;
          } else if (len === 127) {
            if (buf.length < 10) return;
            len = Number(buf.readBigUInt64BE(2)); offset = 10;
          }
          if (buf.length < offset + len) return;
          const payload = buf.subarray(offset, offset + len).toString('utf8');
          buf = buf.subarray(offset + len);
          if (opcode === 0x1) {
            try { messages.push(JSON.parse(payload)); } catch { /* ignore non-JSON frames */ }
          }
        }
      };
      socket.on('data', chunk => { buf = Buffer.concat([buf, chunk]); drain(); });
      socket.on('error', () => { /* the server destroys sockets on stop */ });
      drain();
      resolve({ messages, close: () => socket.destroy() });
    });
    req.end();
  });
}

let server: BridgeServer;
let base: string;
let authServer: BridgeServer;
let authBase: string;
let limitedServer: BridgeServer;
let limitedBase: string;

beforeAll(async () => {
  // A stale usage.json / orchestrator-runs.json from an earlier run would make
  // the metrics assertions read someone else's numbers.
  rmSync(TEST_HOME, { recursive: true, force: true });

  const [port, authPort, limitedPort] = await Promise.all([getFreePort(), getFreePort(), getFreePort()]);

  server = new BridgeServer(config(port));
  await server.start();
  base = `http://127.0.0.1:${port}`;

  authServer = new BridgeServer(config(authPort, { authToken: AUTH_TOKEN }));
  await authServer.start();
  authBase = `http://127.0.0.1:${authPort}`;

  limitedServer = new BridgeServer(config(limitedPort, { rateLimit: { perMinute: 2, maxConcurrent: 16 } }));
  await limitedServer.start();
  limitedBase = `http://127.0.0.1:${limitedPort}`;
});

afterAll(async () => {
  await Promise.all([server.stop(), authServer.stop(), limitedServer.stop()]);
});

beforeEach(() => {
  h.state.connected = true;
  h.state.primaryFails = false;
  h.state.hangUntilAbort = false;
  h.state.abortObserved = false;
  h.state.signalSeen = false;
  h.state.embeddingsModelSeen = null;
});

describe('regression preservation: pre-login behaviour still holds', () => {
  it('propagates a client disconnect to the AbortSignal handed to provider.chat', async () => {
    h.state.hangUntilAbort = true;
    const before = h.state.chatCalls;
    const controller = new AbortController();
    // The rejection is the point of the test; swallow it so it is never unhandled.
    const inflight = fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: PRIMARY, messages: [{ role: 'user', content: 'hold the line' }] }),
      signal: controller.signal,
    }).then(() => 'completed').catch(() => 'aborted');

    await waitFor(() => h.state.chatCalls > before, 'provider.chat to be entered');
    expect(h.state.signalSeen).toBe(true);
    controller.abort();

    await waitFor(() => h.state.abortObserved, 'the provider AbortSignal to fire');
    expect(h.state.abortObserved).toBe(true);
    await expect(inflight).resolves.toBe('aborted');
  });

  it('recovers through fallback_models and names the model that actually answered', async () => {
    h.state.primaryFails = true;
    const res = await post(`${base}/v1/chat/completions`, {
      model: PRIMARY,
      messages: [{ role: 'user', content: 'fallback please' }],
      fallback_models: [FALLBACK],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The response must advertise the model that produced the text, not the
    // primary the client asked for — clients bill and log off this field.
    expect(body.model).toBe(FALLBACK);
    expect(body.choices[0].message.content).toContain(FALLBACK);
    expect(body.choices[0].message.content).toContain(h.REPLY_MARKER);

    const activity = await (await fetch(`${base}/v1/activity`)).json();
    expect(activity.events.some((e: { message: string }) => e.message.includes('fallback completed through ' + FALLBACK))).toBe(true);
  });

  it('returns the OpenAI chat.completion object shape for a non-streaming request', async () => {
    const res = await post(`${base}/v1/chat/completions`, {
      model: PRIMARY,
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.model).toBe(PRIMARY);
    expect(String(body.id).startsWith('chatcmpl-')).toBe(true);
    expect(body.choices[0].index).toBe(0);
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].message.content).toContain('answer from ' + PRIMARY);
    expect(body.choices[0].finish_reason).toBe('stop');
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
  });

  it('streams SSE chunks and terminates with data: [DONE]', async () => {
    const res = await post(`${base}/v1/chat/completions`, {
      model: PRIMARY,
      messages: [{ role: 'user', content: 'stream please' }],
      stream: true,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    const frames = text.split('\n\n').filter(Boolean);
    expect(frames.every(frame => frame.startsWith('data: '))).toBe(true);
    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text).toContain('stream from ' + PRIMARY);
    // The final data frame carries finish_reason before the sentinel.
    expect(text).toContain('"finish_reason":"stop"');
    expect(text.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('returns the documented Responses shape from POST /v1/responses', async () => {
    const res = await post(`${base}/v1/responses`, { model: PRIMARY, input: 'summarise this' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('response');
    expect(body.status).toBe('completed');
    expect(body.model).toBe(PRIMARY);
    expect(String(body.id).startsWith('resp-')).toBe(true);
    expect(body.output[0]).toMatchObject({ type: 'message', role: 'assistant' });
    expect(body.output[0].content[0].type).toBe('output_text');
    expect(body.output[0].content[0].text).toContain('answer from ' + PRIMARY);
  });

  it('routes embeddings to the api-openrouter provider and rejects other namespaces with 501', async () => {
    const ok = await post(`${base}/v1/embeddings`, { model: FALLBACK, input: 'embed me' });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.object).toBe('list');
    expect(body.model).toBe(FALLBACK);
    expect(body.data[0].embedding.length).toBe(3);
    expect(body.usage).toEqual({ prompt_tokens: 4, total_tokens: 4 });
    // The transport prefix is stripped before the id reaches the provider.
    expect(h.state.embeddingsModelSeen).toBe('acme/fallback-model');

    const unsupported = await post(`${base}/v1/embeddings`, { model: PRIMARY, input: 'embed me' });
    expect(unsupported.status).toBe(501);
    const err = await unsupported.json();
    expect(err.error.type).toBe('not_implemented');
    expect(err.error.message).toContain('codex-api or openrouter-api');
  });

  it('reflects a completed request in GET /v1/metrics with numeric token and cost estimates', async () => {
    await post(`${base}/v1/chat/completions`, { model: PRIMARY, messages: [{ role: 'user', content: 'count me' }] });

    const res = await fetch(`${base}/v1/metrics`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('conduit.metrics');
    expect(typeof body.generated_at).toBe('number');
    const metric = body.models[PRIMARY];
    expect(metric.requests).toBeGreaterThan(0);
    expect(metric.successes).toBeGreaterThan(0);
    expect(metric.inputTokens).toBeGreaterThan(0);
    expect(metric.outputTokens).toBeGreaterThan(0);
    expect(metric.estimatedCostUsd).toBeGreaterThan(0);
    expect(typeof metric.averageLatencyMs).toBe('number');

    // There is no separate usage endpoint today: the dashboard's usage view is
    // rendered from /v1/metrics. Pinned so adding one is a deliberate change.
    const usage = await fetch(`${base}/v1/usage-equivalent`);
    expect(usage.status).toBe(404);
    expect((await usage.json()).error.type).toBe('not_found');
  });

  it('serves a bounded activity journal that leaks neither prompt nor response text', async () => {
    await post(`${base}/v1/chat/completions`, {
      model: PRIMARY,
      messages: [{ role: 'user', content: `secret question ${h.PROMPT_MARKER}` }],
    });

    const res = await fetch(`${base}/v1/activity`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('conduit.activity');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.length).toBeLessThanOrEqual(100);
    // Newest first, and every event keeps its original field names.
    expect(body.events[0].id).toBeGreaterThan(body.events[body.events.length - 1].id);
    for (const event of body.events) {
      expect(Object.keys(event).sort()).toEqual(['id', 'level', 'message', 'scope', 'time']);
      const serialised = JSON.stringify(event);
      expect(serialised).not.toContain(h.PROMPT_MARKER);
      expect(serialised).not.toContain(h.REPLY_MARKER);
    }
  });

  it('pushes { type: "activity", event } over the /v1/events WebSocket', async () => {
    const socket = await openEventSocket(base);
    try {
      await post(`${base}/v1/chat/completions`, { model: PRIMARY, messages: [{ role: 'user', content: 'notify me' }] });
      await waitFor(() => socket.messages.length > 0, 'a broadcast frame');
      const frames = socket.messages as Array<{ type: string; event?: Record<string, unknown> }>;
      const activity = frames.find(frame => frame.type === 'activity');
      expect(activity).toBeDefined();
      expect(Object.keys(activity!.event!).sort()).toEqual(['id', 'level', 'message', 'scope', 'time']);
      expect(typeof activity!.event!.scope).toBe('string');
      expect(typeof activity!.event!.message).toBe('string');
    } finally {
      socket.close();
    }
  });

  it('round-trips orchestrator config and returns bounded run history', async () => {
    const initial = await (await fetch(`${base}/v1/orchestrator`)).json();
    expect(initial.strategy).toBe('sequential');
    expect(initial.roles.map((r: { name: string }) => r.name)).toEqual(['Analyst', 'Reviewer', 'Synthesizer']);

    try {
      const saved = await (await post(`${base}/v1/orchestrator`, {
        enabled: true,
        strategy: 'parallel',
        roles: [{ name: 'Analyst', model: PRIMARY }],
        fallbackModels: [],
      })).json();
      expect(saved).toEqual({ enabled: true, strategy: 'parallel', roles: [{ name: 'Analyst', model: PRIMARY }], fallbackModels: [] });
      const reread = await (await fetch(`${base}/v1/orchestrator`)).json();
      expect(reread).toEqual(saved);

      const history = await (await fetch(`${base}/v1/orchestrator/history`)).json();
      expect(history.object).toBe('conduit.orchestrator_history');
      expect(Array.isArray(history.runs)).toBe(true);
      expect(history.runs.length).toBeLessThanOrEqual(50);
    } finally {
      // Orchestrator fallbackModels join every chat request's candidate list,
      // so leaving this test's config in place would alter later tests.
      await post(`${base}/v1/orchestrator`, { enabled: false, strategy: 'sequential', roles: initial.roles, fallbackModels: [] });
    }
  });

  it('returns one comparison result per requested model', async () => {
    const res = await post(`${base}/v1/compare`, { prompt: 'compare these', models: [PRIMARY, FALLBACK] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('conduit.comparison');
    expect(body.prompt_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(body.results.map((r: { model: string }) => r.model)).toEqual([PRIMARY, FALLBACK]);
    for (const result of body.results) {
      expect(result.ok).toBe(true);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.content).toContain('answer from ' + result.model);
    }
  });

  it('answers with a rate-limit error instead of crashing once perMinute is exceeded', async () => {
    const send = () => post(`${limitedBase}/v1/chat/completions`, { model: PRIMARY, messages: [{ role: 'user', content: 'again' }] });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const third = await send();
    expect(third.status).toBe(429);
    const body = await third.json();
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.message).toBe('rate limit exceeded');
    // The server stays healthy after refusing a request.
    expect((await fetch(`${limitedBase}/health`)).status).toBe(200);
  });

  it('gates /v1/* behind the bearer token while /health stays open', async () => {
    const open = await fetch(`${authBase}/health`);
    expect(open.status).toBe(200);
    expect((await open.json()).status).toBe('ok');

    const denied = await fetch(`${authBase}/v1/models`);
    expect(denied.status).toBe(401);
    expect((await denied.json()).error.message).toContain('Unauthorized');

    const wrong = await fetch(`${authBase}/v1/models`, { headers: { Authorization: 'Bearer nope' } });
    expect(wrong.status).toBe(401);

    const allowed = await fetch(`${authBase}/v1/models`, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } });
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).object).toBe('list');

    // The dashboard is served from the same origin and is gated too.
    expect((await fetch(`${authBase}/`)).status).toBe(401);
  });

  it('exposes availability metadata on /v1/models and keeps the OpenRouter passthrough namespace', async () => {
    const body = await (await fetch(`${base}/v1/models`)).json();
    const primary = body.data.find((m: { id: string }) => m.id === PRIMARY);
    expect(primary).toMatchObject({ object: 'model', created: 0, owned_by: 'xai' });
    expect(primary.conduit).toEqual({ availability: 'verified', source: 'catalog' });
    // A model that declares neither field falls back to the documented defaults.
    const dynamic = body.data.find((m: { id: string }) => m.id === FALLBACK);
    expect(dynamic.conduit).toEqual({ availability: 'dynamic', source: 'provider' });

    // The real registry (the fake above only stands in for the HTTP layer)
    // must still route an id that no catalogue enumerates.
    const { ProviderRegistry } = await vi.importActual<typeof import('../src/registry.js')>('../src/registry.js');
    const real = new ProviderRegistry(config(0));
    expect(real.providerForModel('api-openrouter/acme/never-enumerated')?.name).toBe('openrouter-api');
    expect(real.allModels().some(m => m.availability === 'verified')).toBe(true);
    expect(real.allModels().some(m => m.availability === 'documented')).toBe(true);
  });

  it('keeps the dashboard invariants intact', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toBe(DASHBOARD_HTML);

    // The app bar padding is a user-fixed value; nothing may widen or shorten it.
    const appbar = DASHBOARD_HTML.match(/\.appbar \{[\s\S]*?\}/)?.[0] ?? '';
    expect(appbar).toContain('padding: 12px 12px;');
    expect(appbar.match(/padding:[^;]*;/g)).toEqual(['padding: 12px 12px;']);

    expect(DASHBOARD_HTML).toContain('id="model-search"');
    expect(DASHBOARD_HTML).toContain(`$('model-search').addEventListener('input'`);
    expect(DASHBOARD_HTML).toContain('id="login-panel"');

    expect(DASHBOARD_HTML).toContain('Open login browser');
    expect(DASHBOARD_HTML).toContain('Built into port 31338');
    expect(DASHBOARD_HTML).not.toContain('Local-first model infrastructure');

    for (const machineSpecific of ['thread-chef', '/home/chef-linux']) {
      expect(DASHBOARD_HTML).not.toContain(machineSpecific);
    }
  });

  it('renders the complete standalone Help page directly', async () => {
    const res = await fetch(`${base}/help`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(HELP_HTML);
    expect(text).toContain('Requirements and installation');
    expect(text).toContain('Remote Linux over SSH');
    expect(text).toContain('Browser-provider sign-in');
    expect(text).toContain('Security');
    expect(text.endsWith('</main></body></html>')).toBe(true);
  });
});
