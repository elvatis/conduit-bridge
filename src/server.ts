import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { BridgeConfig } from './types.js';
import { ProviderRegistry } from './registry.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

export class BridgeServer {
  private _registry: ProviderRegistry;
  private _server: ReturnType<typeof createServer> | null = null;
  private _cfg: BridgeConfig;
  private _keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(cfg: BridgeConfig) {
    this._cfg = cfg;
    this._registry = new ProviderRegistry(cfg);
  }

  get registry(): ProviderRegistry {
    return this._registry;
  }

  async start(): Promise<void> {
    this._server = createServer((req, res) => {
      this._handleRequest(req, res).catch(err => {
        logger.error(`Unhandled request error: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message, type: 'internal_error' } }));
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._cfg.port, this._cfg.host, () => {
        logger.info(`Proxy listening on ${this._cfg.host}:${this._cfg.port}`);
        resolve();
      });
      this._server!.on('error', reject);
    });

    // Restore sessions after server is up (non-blocking)
    setTimeout(() => {
      this._registry.restoreSessions().catch(err =>
        logger.warn(`Session restore error: ${err.message}`),
      );
    }, 3000);

    // Session keepalive: every 5 minutes, check and reconnect stale providers
    this._keepaliveTimer = setInterval(() => {
      this._registry.keepaliveSessions().catch(err =>
        logger.warn(`Session keepalive error: ${err.message}`),
      );
    }, 5 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this._keepaliveTimer) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = null;
    }
    if (this._server) {
      await new Promise<void>(resolve => this._server!.close(() => resolve()));
      this._server = null;
      logger.info('Proxy stopped');
    }
  }

  /**
   * Effective CORS allowlist: the configured origins plus the loopback origins
   * the server itself is reachable on (so a browser app on the same host:port
   * always works). Only a request Origin present in this set is reflected.
   */
  private _allowedOrigins(): Set<string> {
    const list = new Set<string>(this._cfg.allowedOrigins ?? []);
    const { host, port } = this._cfg;
    for (const h of new Set([host, 'localhost', '127.0.0.1', '[::1]'])) {
      list.add(`http://${h}`);
      list.add(`http://${h}:${port}`);
    }
    return list;
  }

  /**
   * Bearer-token auth check. Returns true when auth is disabled (no token
   * configured) or when the request carries the correct 'Authorization: Bearer
   * <token>' header. The token comparison is constant-time.
   */
  private _checkAuth(req: IncomingMessage): boolean {
    const token = this._cfg.authToken ?? '';
    if (!token) return true; // auth disabled (default)
    const header = req.headers.authorization ?? '';
    // Parse 'Bearer <token>' with plain string ops (no regex) to avoid any
    // backtracking on attacker-controlled header values.
    const sp = header.indexOf(' ');
    if (sp === -1) return false;
    if (header.slice(0, sp).toLowerCase() !== 'bearer') return false;
    const provided = header.slice(sp + 1).trim();
    if (!provided) return false;
    return safeEqual(provided, token);
  }

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS: reflect the request Origin only when it is in the allowlist.
    // Requests with no Origin header (curl, server-side OpenAI clients) are
    // unaffected and continue to work.
    const origin = req.headers.origin;
    if (origin && this._allowedOrigins().has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── GET /health ──────────────────────────────────────────────────────────
    // Always open (no auth) so health checks keep working.
    if (url === '/health' && method === 'GET') {
      json(res, 200, { status: 'ok', service: 'conduit-bridge', version: PKG_VERSION });
      return;
    }

    // ── Optional bearer-token auth ─────────────────────────────────────────────
    // When BridgeConfig.authToken is set, every endpoint below requires a
    // matching 'Authorization: Bearer <token>' header. When unset (default),
    // the server behaves exactly as before (no auth).
    if (!this._checkAuth(req)) {
      json(res, 401, { error: { message: 'Unauthorized: valid bearer token required', type: 'invalid_request' } });
      return;
    }

    // ── GET /v1/models ───────────────────────────────────────────────────────
    if (url === '/v1/models' && method === 'GET') {
      const models = this._registry.allModels().map(m => ({
        id: m.id,
        object: 'model',
        created: 0,
        owned_by: m.owned_by,
      }));
      json(res, 200, { object: 'list', data: models });
      return;
    }

    // ── GET /v1/status ───────────────────────────────────────────────────────
    if (url === '/v1/status' && method === 'GET') {
      const status = await this._registry.getStatus();
      json(res, 200, status);
      return;
    }

    // ── POST /v1/login/:provider ─────────────────────────────────────────────
    const loginMatch = url.match(/^\/v1\/login\/(grok|claude|gemini|chatgpt|claude-api|gemini-api|codex-api)$/);
    if (loginMatch && method === 'POST') {
      const name = loginMatch[1] as import('./types.js').ProviderName;
      const provider = this._registry.get(name);

      // API providers don't use browser login - return helpful message
      if (name.endsWith('-api')) {
        json(res, 400, { status: 'error', provider: name, message: `${name} uses API keys, not browser login. Set your key via: conduit-bridge config apiKeys.${name} <key>` });
        return;
      }

      // Respond immediately, login happens async
      json(res, 202, { status: 'login_started', provider: name, message: `Browser opened for ${name} — log in and close when done.` });

      provider.login(loginUrl => {
        logger.info(`[${name}] login page opened: ${loginUrl}`);
      }).catch(err => {
        logger.warn(`[${name}] login error: ${err.message}`);
      });
      return;
    }

    // ── POST /v1/logout/:provider ────────────────────────────────────────────
    const logoutMatch = url.match(/^\/v1\/logout\/(grok|claude|gemini|chatgpt|claude-api|gemini-api|codex-api)$/);
    if (logoutMatch && method === 'POST') {
      const name = logoutMatch[1] as import('./types.js').ProviderName;
      await this._registry.get(name).logout();
      json(res, 200, { status: 'ok', provider: name });
      return;
    }

    // ── POST /v1/chat/completions ────────────────────────────────────────────
    if (url === '/v1/chat/completions' && method === 'POST') {
      const body = await readBody(req);
      let req_data: any;
      try {
        req_data = JSON.parse(body);
      } catch {
        json(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request' } });
        return;
      }

      const { model, messages, stream = false, temperature, max_tokens } = req_data;
      if (!model || !messages) {
        json(res, 400, { error: { message: 'model and messages required', type: 'invalid_request' } });
        return;
      }

      const provider = this._registry.providerForModel(model);
      if (!provider) {
        json(res, 404, { error: { message: `Unknown model: ${model}`, type: 'invalid_request' } });
        return;
      }

      // Try to ensure connected — will auto-restore session if needed
      const connected = await provider.ensureConnected();
      if (!connected) {
        json(res, 503, { error: { message: `${provider.name} is not connected. POST /v1/login/${provider.name} to log in.`, type: 'provider_unavailable' } });
        return;
      }

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const id = `chatcmpl-${Date.now()}`;
        try {
          for await (const chunk of provider.chatStream({ model, messages, temperature, max_tokens })) {
            // Include provider metadata if available (thinking status, tokens, timing)
            const meta = 'currentMeta' in provider ? (provider as any).currentMeta : undefined;
            const data = JSON.stringify({
              id, object: 'chat.completion.chunk', model,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
              ...(meta ? { conduit_meta: meta } : {}),
            });
            res.write(`data: ${data}\n\n`);
          }
          // Send final metadata with done signal
          const finalMeta = 'currentMeta' in provider ? (provider as any).currentMeta : undefined;
          const doneData = JSON.stringify({
            id, object: 'chat.completion.chunk', model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            ...(finalMeta ? { conduit_meta: finalMeta } : {}),
          });
          res.write(`data: ${doneData}\n\n`);
          res.write('data: [DONE]\n\n');
        } catch (err) {
          const errData = JSON.stringify({ error: (err as Error).message });
          res.write(`data: ${errData}\n\n`);
        }
        res.end();
      } else {
        try {
          const content = await provider.chat({ model, messages, temperature, max_tokens });
          json(res, 200, {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            model,
            choices: [{
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          });
        } catch (err) {
          json(res, 503, { error: { message: (err as Error).message, type: 'provider_error' } });
        }
      }
      return;
    }

    // 404
    json(res, 404, { error: { message: `Not found: ${url}`, type: 'not_found' } });
  }
}

/** Constant-time string comparison (avoids leaking the token via timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function json(res: ServerResponse, status: number, body: object) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
