import { describe, expect, it, vi } from 'vitest';
import { Duplex } from 'node:stream';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VscodeBridgeConnection, type VscodeDispatchRequest, type VscodeDispatchResult } from '../src/vscode-bridge.js';
import { BridgeServer } from '../src/server.js';
import { BudgetManager } from '../src/budget.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';

class MemorySocket extends Duplex {
  readonly writes: Buffer[] = [];
  _read(): void {}
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes.push(Buffer.from(chunk)); callback();
  }
  receive(chunk: Buffer): void { this.push(chunk); }
  disconnect(): void { this.push(null); this.destroy(); }
}

function clientFrame(payload: string | Buffer, options: { opcode?: number; fin?: boolean; masked?: boolean; declaredLength?: bigint } = {}): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const opcode = options.opcode ?? 1; const fin = options.fin ?? true; const masked = options.masked ?? true;
  const declared = options.declaredLength ?? BigInt(body.length);
  let header: Buffer;
  if (declared < 126n) header = Buffer.from([(fin ? 0x80 : 0) | opcode, (masked ? 0x80 : 0) | Number(declared)]);
  else if (declared < 65_536n) {
    header = Buffer.alloc(4); header[0] = (fin ? 0x80 : 0) | opcode; header[1] = (masked ? 0x80 : 0) | 126; header.writeUInt16BE(Number(declared), 2);
  } else {
    header = Buffer.alloc(10); header[0] = (fin ? 0x80 : 0) | opcode; header[1] = (masked ? 0x80 : 0) | 127; header.writeBigUInt64BE(declared, 2);
  }
  if (!masked) return Buffer.concat([header, body]);
  const mask = Buffer.from([0x19, 0x82, 0x37, 0x44]); const encoded = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index++) encoded[index] = body[index] ^ mask[index & 3];
  return Buffer.concat([header, mask, encoded]);
}

function outbound(socket: MemorySocket): Array<{ opcode: number; payload: Buffer }> {
  const buffer = Buffer.concat(socket.writes); const frames: Array<{ opcode: number; payload: Buffer }> = []; let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f; let length = buffer[offset + 1] & 0x7f; let header = 2;
    if (length === 126) { length = buffer.readUInt16BE(offset + 2); header = 4; }
    else if (length === 127) { length = Number(buffer.readBigUInt64BE(offset + 2)); header = 10; }
    if (offset + header + length > buffer.length) break;
    frames.push({ opcode, payload: buffer.subarray(offset + header, offset + header + length) }); offset += header + length;
  }
  return frames;
}

function messages(socket: MemorySocket): any[] {
  return outbound(socket).filter(frame => frame.opcode === 1).map(frame => JSON.parse(frame.payload.toString('utf8')));
}

function request(type: string, requestId: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ type, requestId, payload });
}

function fixture(dispatch: (request: VscodeDispatchRequest) => Promise<VscodeDispatchResult>, authorize = () => true, options = {}) {
  const socket = new MemorySocket();
  const connection = new VscodeBridgeConnection(socket, { dispatch, authorize, authorization: 'Bearer test-token', ...options });
  return { socket, connection };
}

function upgradeStatus(port: number, path: string, authorization?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13',
    };
    if (authorization) headers.Authorization = authorization;
    const req = httpRequest({ hostname: '127.0.0.1', port, path, headers });
    req.once('response', response => { response.resume(); resolve(response.statusCode || 0); });
    req.once('upgrade', response => { response.socket.destroy(); resolve(response.statusCode || 101); });
    req.once('error', reject); req.end();
  });
}

function openBridgeSocket(port: number, authorization: string): Promise<{ socket: Duplex; messages: any[]; send: (value: string) => void }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1', port, path: '/vscode',
      headers: {
        Authorization: authorization, Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13',
      },
    });
    req.once('response', response => reject(new Error(`Upgrade failed with ${response.statusCode}`)));
    req.once('error', reject);
    req.once('upgrade', (_response, socket: Duplex, head: Buffer) => {
      const received: any[] = []; let buffer = head.length ? Buffer.from(head) : Buffer.alloc(0);
      const drain = () => {
        for (;;) {
          if (buffer.length < 2) return;
          const opcode = buffer[0] & 0x0f; let length = buffer[1] & 0x7f; let offset = 2;
          if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
          else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
          if (buffer.length < offset + length) return;
          const payload = buffer.subarray(offset, offset + length); buffer = buffer.subarray(offset + length);
          if (opcode === 1) received.push(JSON.parse(payload.toString('utf8')));
        }
      };
      socket.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); drain(); });
      socket.on('error', () => {}); drain();
      resolve({ socket, messages: received, send: value => socket.write(clientFrame(value)) });
    });
    req.end();
  });
}

describe('VscodeBridgeConnection', () => {
  it('accepts masked fragmented chat messages, handles ping, and streams only through platform routes', async () => {
    const calls: VscodeDispatchRequest[] = [];
    const { socket } = fixture(async call => {
      calls.push(call);
      if (call.path === '/v1/platform/sessions') return { status: 201, body: { session: { id: 'session-1' } } };
      call.onEvent?.({ type: 'delta', delta: 'hel' }); call.onEvent?.({ type: 'delta', delta: 'lo' });
      return { status: 200, body: { session: { id: 'session-1' }, assistantMessage: { content: 'hello' } } };
    });
    const wire = request('chat', 'chat-1', { model: 'cli-codex/test', content: 'hello' });
    socket.receive(clientFrame(wire.slice(0, 12), { fin: false }));
    socket.receive(clientFrame('alive', { opcode: 9 }));
    socket.receive(clientFrame(wire.slice(12), { opcode: 0 }));
    await vi.waitFor(() => expect(messages(socket).some(message => message.type === 'response')).toBe(true));

    expect(outbound(socket).some(frame => frame.opcode === 10 && frame.payload.toString() === 'alive')).toBe(true);
    expect(calls.map(call => call.path)).toEqual(['/v1/platform/sessions', '/v1/platform/sessions/session-1/messages']);
    expect(calls.every(call => call.authorization === 'Bearer test-token')).toBe(true);
    expect(messages(socket).filter(message => message.type === 'stream-chunk').map(message => message.payload)).toEqual([
      { delta: 'hel' }, { delta: 'lo' }, { delta: '', done: true },
    ]);
    expect(messages(socket).find(message => message.type === 'response').payload.sessionId).toBe('session-1');
  });

  it('returns inline edits as review-required proposals and never requests agent execution', async () => {
    const calls: VscodeDispatchRequest[] = [];
    const { socket } = fixture(async call => {
      calls.push(call);
      if (call.path === '/v1/platform/sessions') return { status: 201, body: { session: { id: 'edit-session' } } };
      call.onEvent?.({ type: 'delta', delta: 'const answer = 42;' });
      return { status: 200, body: { assistantMessage: { content: 'const answer = 42;' } } };
    });
    socket.receive(clientFrame(request('inline-edit', 'edit-1', {
      model: 'cli-codex/test', instruction: 'Use a constant', code: 'let answer = 42;', languageId: 'typescript', filePath: 'src/a.ts',
      retention: 'retained',
    })));
    await vi.waitFor(() => expect(messages(socket).some(message => message.type === 'response')).toBe(true));
    const response = messages(socket).find(message => message.type === 'response');
    expect(response.payload).toMatchObject({ proposal: 'const answer = 42;', applyRequired: true });
    expect(calls[0].body).toMatchObject({ retention: 'ephemeral' });
    expect(calls[1].body).toMatchObject({ stream: true });
    expect(JSON.stringify(calls)).not.toContain('"mode":"agent"');
    expect(JSON.stringify(calls)).not.toContain('apply');
  });

  it('forces durable agent starts into approval and uses scoped run actions for review and cancellation', async () => {
    const calls: VscodeDispatchRequest[] = [];
    const { socket } = fixture(async call => {
      calls.push(call);
      return { status: call.path === '/v1/platform/runs' ? 202 : 200, body: { run: { id: 'run-1', status: 'waiting_approval', costUsd: 0, tokensConsumed: 0 } } };
    });
    socket.receive(clientFrame(request('agent-session', 'agent-start', { model: 'cli-codex/test', prompt: 'Update tests', workspaceId: 'repo' })));
    await vi.waitFor(() => expect(messages(socket).some(message => message.requestId === 'agent-start' && message.type === 'response')).toBe(true));
    socket.receive(clientFrame(request('agent-session', 'agent-approve', { action: 'approve', runId: 'run-1' })));
    await vi.waitFor(() => expect(messages(socket).some(message => message.requestId === 'agent-approve' && message.type === 'response')).toBe(true));

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/platform/runs', body: { mode: 'agent', requiresApproval: true } });
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/v1/platform/runs/run-1/actions', body: { action: 'approve' } });
    expect(messages(socket).filter(message => message.type === 'usage')).toHaveLength(2);
  });

  it('re-authenticates each message and closes after credential revocation', async () => {
    let authorized = true; const dispatch = vi.fn(async () => ({ status: 200, body: { data: [] } }));
    const { socket } = fixture(dispatch, () => authorized);
    socket.receive(clientFrame(request('cost-query', 'cost-1', {})));
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    authorized = false;
    socket.receive(clientFrame(request('cost-query', 'cost-2', {})));
    await vi.waitFor(() => expect(outbound(socket).some(frame => frame.opcode === 8)).toBe(true));
    expect(messages(socket).find(message => message.requestId === 'cost-2')).toMatchObject({ type: 'error', payload: { status: 401, code: 'unauthorized' } });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('aborts active platform work on client cancellation and disconnect', async () => {
    const signals: AbortSignal[] = [];
    const dispatch = (call: VscodeDispatchRequest): Promise<VscodeDispatchResult> => {
      if (call.path === '/v1/platform/sessions') return Promise.resolve({ status: 201, body: { session: { id: 'slow-session' } } });
      signals.push(call.signal);
      return new Promise((_resolve, reject) => call.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }));
    };
    const { socket } = fixture(dispatch);
    socket.receive(clientFrame(request('chat', 'slow-chat', { model: 'cli-codex/test', content: 'wait' })));
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    socket.receive(clientFrame(request('chat', 'cancel-1', { action: 'cancel', targetRequestId: 'slow-chat' })));
    await vi.waitFor(() => expect(signals[0].aborted).toBe(true));
    expect(messages(socket).find(message => message.requestId === 'cancel-1').payload.cancelled).toBe(true);

    const second = fixture(dispatch); second.socket.receive(clientFrame(request('chat', 'slow-2', { model: 'cli-codex/test', content: 'wait' })));
    await vi.waitFor(() => expect(signals).toHaveLength(2)); second.socket.disconnect();
    await vi.waitFor(() => expect(signals[1].aborted).toBe(true));
  });

  it('enforces masking, message sizes, and bounded concurrent work', async () => {
    const first = fixture(async () => ({ status: 200, body: { data: [] } }));
    first.socket.receive(clientFrame(request('cost-query', 'bad-mask', {}), { masked: false }));
    await vi.waitFor(() => expect(outbound(first.socket).some(frame => frame.opcode === 8)).toBe(true));
    expect(outbound(first.socket).find(frame => frame.opcode === 8)?.payload.readUInt16BE(0)).toBe(1002);

    const second = fixture(async () => ({ status: 200, body: { data: [] } }), () => true, { maxMessageBytes: 1024 });
    second.socket.receive(clientFrame(Buffer.alloc(0), { declaredLength: 65_536n }));
    await vi.waitFor(() => expect(outbound(second.socket).some(frame => frame.opcode === 8)).toBe(true));
    expect(outbound(second.socket).find(frame => frame.opcode === 8)?.payload.readUInt16BE(0)).toBe(1009);

    let release!: () => void;
    const pending = new Promise<VscodeDispatchResult>(resolve => { release = () => resolve({ status: 200, body: { data: [] } }); });
    const third = fixture(() => pending, () => true, { maxInFlight: 1 });
    third.socket.receive(clientFrame(request('cost-query', 'one', {})));
    third.socket.receive(clientFrame(request('cost-query', 'two', {})));
    await vi.waitFor(() => expect(messages(third.socket).some(message => message.requestId === 'two')).toBe(true));
    expect(messages(third.socket).find(message => message.requestId === 'two')).toMatchObject({ type: 'error', payload: { status: 429, code: 'concurrency_limit' } });
    release();
  });
});

describe('/vscode upgrade integration', () => {
  it('requires header authentication, rejects query credentials, and reaches the scoped platform router', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'conduit-vscode-bridge-'));
    const token = 'bridge-vscode-integration-token-32-bytes';
    const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
    const server = new BridgeServer({ host: '127.0.0.1', port: 0, logLevel: 'silent', apiKeys: {}, authToken: token, rateLimit: { perMinute: 100, maxConcurrent: 4 } }, {
      platformStore: store, budgetManager: new BudgetManager(undefined, join(runtime, 'budget.json')),
    });
    await server.start();
    const port = ((server as any)._server.address() as AddressInfo).port;
    try {
      expect(await upgradeStatus(port, '/vscode')).toBe(401);
      expect(await upgradeStatus(port, `/vscode?token=${encodeURIComponent(token)}`, `Bearer ${token}`)).toBe(401);
      const client = await openBridgeSocket(port, `Bearer ${token}`);
      try {
        client.send(request('cost-query', 'integration-cost', {}));
        await vi.waitFor(() => expect(client.messages.some(message => message.type === 'response')).toBe(true));
        expect(client.messages).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'usage', requestId: 'integration-cost', payload: expect.objectContaining({ runCount: 0, costUsd: 0, tokens: 0 }) }),
          expect.objectContaining({ type: 'response', requestId: 'integration-cost', payload: expect.objectContaining({ kind: 'cost-query' }) }),
        ]));
      } finally { client.socket.destroy(); }
    } finally {
      await server.stop(); rmSync(runtime, { recursive: true, force: true });
    }
  });
});
