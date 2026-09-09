import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { BridgeServer } from './server.js';
import { bearerAuthorization } from './config.js';
import type { BridgeConfig } from './types.js';
import { logger } from './logger.js';
import { assertSupportedPlatform } from './platform.js';

export type ChatCommand =
  | { type: 'help' }
  | { type: 'quit' }
  | { type: 'new' }
  | { type: 'models' }
  | { type: 'model'; id: string }
  | { type: 'stop' }
  | { type: 'prompt'; text: string }
  | { type: 'empty' }
  | { type: 'unknown'; text: string };

export interface ChatModelRow { id: string; displayName?: string }
export interface ChatSession { id: string; model: string }
export interface ChatTurnClient {
  listModels(): Promise<ChatModelRow[]>;
  createSession(model: string): Promise<ChatSession>;
  send(sessionId: string, content: string, model: string, signal?: AbortSignal, onDelta?: (delta: string) => void): Promise<string>;
  cancel(sessionId: string): Promise<void>;
}
export interface ChatIo {
  write(text: string): void;
  prompt(query: string): Promise<string | null>;
}

const HELP = `Commands:
  /help              Show this help
  /models            List advertised models
  /model <id>        Use a model for the next reply
  /new               Start a new conversation
  /stop              Cancel the in-flight reply
  /quit              Leave chat
Type a message and press Enter to send.`;

export function parseChatCommand(raw: string): ChatCommand {
  const text = raw.replace(/\r$/, '');
  if (!text.trim()) return { type: 'empty' };
  if (!text.startsWith('/')) return { type: 'prompt', text };
  const [name, ...rest] = text.slice(1).trim().split(/\s+/);
  const arg = rest.join(' ').trim();
  if (name === 'help') return { type: 'help' };
  if (name === 'quit' || name === 'exit' || name === 'q') return { type: 'quit' };
  if (name === 'new') return { type: 'new' };
  if (name === 'stop') return { type: 'stop' };
  if (name === 'models') return { type: 'models' };
  if (name === 'model') return arg ? { type: 'model', id: arg } : { type: 'models' };
  return { type: 'unknown', text };
}

export function preferredChatModel(models: ChatModelRow[]): string | undefined {
  const rank = (id: string) => id.startsWith('cli-') ? 0 : /^(lmstudio|bitnet)(\/|$)/.test(id) ? 1 : 2;
  return [...models].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))[0]?.id;
}

export function parseSseChunk(chunk: string): { deltas: string[]; done?: { assistantMessage?: { content?: string } }; rest: string } {
  const deltas: string[] = [];
  let done: { assistantMessage?: { content?: string } } | undefined;
  const parts = chunk.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const frame of parts) {
    const line = frame.split('\n').find(item => item.startsWith('data:'));
    if (!line) continue;
    try {
      const event = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string; assistantMessage?: { content?: string } };
      if (event.type === 'delta' && typeof event.delta === 'string') deltas.push(event.delta);
      if (event.type === 'done') done = event;
    } catch { /* ignore a truncated or non-JSON frame */ }
  }
  return { deltas, done, rest };
}

function modelPriorityLabel(id: string): string {
  return id.startsWith('cli-') ? 'cli' : /^(lmstudio|bitnet)(\/|$)/.test(id) ? 'local' : 'api';
}

export async function runInteractiveChat(options: { io: ChatIo; client: ChatTurnClient; model?: string }): Promise<void> {
  const { io, client } = options;
  const models = await client.listModels();
  if (!models.length) throw new Error('No models are advertised. Connect a provider, then try again.');
  let model = options.model && models.some(item => item.id === options.model) ? options.model : preferredChatModel(models);
  if (!model) throw new Error('No models are advertised. Connect a provider, then try again.');
  let session = await client.createSession(model);
  let inFlight: AbortController | undefined;
  io.write(`Conduit chat  ${model}\n${HELP}\n`);
  const lineLabel = () => `${model} > `;
  while (true) {
    const raw = await io.prompt(lineLabel());
    if (raw === null) break;
    const command = parseChatCommand(raw);
    if (command.type === 'empty') continue;
    if (command.type === 'help') { io.write(`${HELP}\n`); continue; }
    if (command.type === 'quit') break;
    if (command.type === 'unknown') { io.write(`Unknown command ${command.text}. Type /help.\n`); continue; }
    if (command.type === 'models') {
      for (const item of models) io.write(`  ${item.id}${item.id === model ? '  (current)' : ''}  ${modelPriorityLabel(item.id)}\n`);
      continue;
    }
    if (command.type === 'model') {
      if (!models.some(item => item.id === command.id)) { io.write(`Unknown model ${command.id}. Type /models.\n`); continue; }
      model = command.id;
      io.write(`Next reply uses ${model}. Conversation history is kept.\n`);
      continue;
    }
    if (command.type === 'new') {
      session = await client.createSession(model);
      io.write(`New conversation ${session.id}\n`);
      continue;
    }
    if (command.type === 'stop') {
      if (!inFlight) { io.write('No reply is in flight.\n'); continue; }
      inFlight.abort();
      await client.cancel(session.id).catch(() => {});
      io.write('\nCancelled.\n');
      continue;
    }
    inFlight = new AbortController();
    io.write('\n');
    try {
      const answer = await client.send(session.id, command.text, model, inFlight.signal, delta => io.write(delta));
      if (answer && !answer.endsWith('\n')) io.write('\n');
      io.write('\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.write(inFlight.signal.aborted ? '\nCancelled.\n' : `\n${message}\n`);
    } finally {
      inFlight = undefined;
    }
  }
}

type RequestResult = { status: number; headers: IncomingMessage['headers']; text: string };

function requestOnce(url: URL, options: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<RequestResult> {
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = transport({
      protocol: url.protocol, hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`,
      method: options.method || 'GET', headers: options.headers,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    options.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function requestJson<T>(url: URL, options: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body) headers['Content-Type'] = 'application/json';
  const result = await requestOnce(url, { method: options.method, headers, body, signal: options.signal });
  if (result.status >= 400) {
    let message = result.text || `HTTP ${result.status}`;
    try {
      const error = JSON.parse(result.text) as { error?: { message?: string } };
      if (error.error?.message) message = error.error.message;
    } catch { /* keep the raw body */ }
    throw new Error(message);
  }
  return result.text ? JSON.parse(result.text) as T : {} as T;
}

export function createHttpChatClient(baseUrl: string, headers: Record<string, string> = {}): ChatTurnClient {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    async listModels() {
      const body = await requestJson<{ data?: Array<{ id: string; display_name?: string }> }>(new URL(`${root}/v1/models`), { headers });
      return (body.data || []).map(item => ({ id: item.id, displayName: item.display_name }));
    },
    async createSession(model) {
      const body = await requestJson<{ session: { id: string; model?: string } }>(new URL(`${root}/v1/platform/sessions`), {
        method: 'POST', headers, body: { model, title: 'CLI chat', retention: 'retained' },
      });
      return { id: body.session.id, model: body.session.model || model };
    },
    async send(sessionId, content, model, signal, onDelta) {
      const url = new URL(`${root}/v1/platform/sessions/${encodeURIComponent(sessionId)}/messages`);
      const payload = JSON.stringify({ content, model, stream: true, maxOutputTokens: 1024 });
      const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
      return new Promise<string>((resolve, reject) => {
        const req = transport({
          protocol: url.protocol, hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: { ...headers, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        }, res => {
          if ((res.statusCode || 0) >= 400) {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => reject(new Error(Buffer.concat(chunks).toString('utf8') || `HTTP ${res.statusCode}`)));
            return;
          }
          let rest = '';
          let assembled = '';
          res.on('data', chunk => {
            const parsed = parseSseChunk(rest + chunk.toString('utf8'));
            rest = parsed.rest;
            for (const delta of parsed.deltas) { assembled += delta; onDelta?.(delta); }
            if (parsed.done) assembled = parsed.done.assistantMessage?.content || assembled;
          });
          res.on('end', () => resolve(assembled));
          res.on('error', reject);
        });
        req.on('error', reject);
        signal?.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true });
        req.write(payload);
        req.end();
      });
    },
    async cancel(sessionId) {
      await requestJson(new URL(`${root}/v1/platform/sessions/${encodeURIComponent(sessionId)}/cancel`), { method: 'POST', headers, body: {} });
    },
  };
}

export async function probeHealth(baseUrl: string, headers: Record<string, string> = {}): Promise<boolean> {
  try {
    const result = await requestOnce(new URL(`${baseUrl.replace(/\/+$/, '')}/health`), { headers });
    return result.status === 200;
  } catch {
    return false;
  }
}

function readlineIo(): ChatIo & { close(): void } {
  const rl = createInterface({ input, output, terminal: output.isTTY });
  return {
    write: text => { output.write(text); },
    prompt: async query => {
      try { return await rl.question(query); } catch { return null; }
    },
    close: () => rl.close(),
  };
}

export async function runChatCommand(cfg: BridgeConfig, flags: { model?: string } = {}): Promise<void> {
  assertSupportedPlatform();
  const baseUrl = `http://${cfg.host}:${cfg.port}`;
  const headers = bearerAuthorization(cfg.authToken);
  let stop: (() => Promise<void>) | undefined;
  if (!await probeHealth(baseUrl, headers)) {
    logger.info(`No listener on ${cfg.host}:${cfg.port}; starting one for this chat session`);
    const server = new BridgeServer(cfg);
    await server.start();
    stop = async () => { await server.stop(); };
  } else {
    logger.info(`Attached to existing listener on ${cfg.host}:${cfg.port}`);
  }
  const io = readlineIo();
  try {
    await runInteractiveChat({ io, client: createHttpChatClient(baseUrl, headers), model: flags.model });
  } finally {
    io.close();
    if (stop) await stop();
  }
}
