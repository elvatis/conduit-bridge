import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { BridgeConfig } from './types.js';
import { ProviderRegistry } from './registry.js';
import { logger } from './logger.js';

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

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── GET /health ──────────────────────────────────────────────────────────
    if (url === '/health' && method === 'GET') {
      json(res, 200, { status: 'ok', service: 'conduit-bridge', version: '0.1.0' });
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
    const loginMatch = url.match(/^\/v1\/login\/(grok|claude|gemini|chatgpt)$/);
    if (loginMatch && method === 'POST') {
      const name = loginMatch[1] as 'grok' | 'claude' | 'gemini' | 'chatgpt';
      const provider = this._registry.get(name);

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
    const logoutMatch = url.match(/^\/v1\/logout\/(grok|claude|gemini|chatgpt)$/);
    if (logoutMatch && method === 'POST') {
      const name = logoutMatch[1] as 'grok' | 'claude' | 'gemini' | 'chatgpt';
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
            const data = JSON.stringify({
              id, object: 'chat.completion.chunk', model,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
            });
            res.write(`data: ${data}\n\n`);
          }
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
