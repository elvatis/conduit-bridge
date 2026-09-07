import type { Duplex } from 'node:stream';
import { redactSecrets } from './redact.js';

/** Maximum decoded client message size accepted by default. */
export const VSCODE_MAX_MESSAGE_BYTES = 262_144;
/** Maximum simultaneous requests accepted on one extension connection. */
export const VSCODE_MAX_IN_FLIGHT = 4;

/** Supported request discriminator values. */
export type VscodeRequestType = 'chat' | 'inline-edit' | 'agent-session' | 'cost-query';

/** Payload for a streamed platform conversation or cancellation of one live request. */
export interface VscodeChatPayload {
  action?: 'cancel'; targetRequestId?: string; sessionId?: string; model?: string; content?: string;
  title?: string; retention?: 'ephemeral' | 'retained'; workspaceId?: string; profileId?: string; agentId?: string;
  effort?: string; contextTokens?: number; maxOutputTokens?: number; memoryIds?: string[]; ttlMs?: number;
}
/** Source selection and instruction used to generate a review-only edit proposal. */
export interface VscodeInlineEditPayload {
  model: string; instruction: string; code: string; languageId?: string; filePath?: string;
  workspaceId?: string; profileId?: string; agentId?: string; effort?: string; maxOutputTokens?: number;
}
/** Durable, approval-gated agent run creation, inspection, review, or cancellation. */
export interface VscodeAgentSessionPayload {
  action?: 'start' | 'status' | 'approve' | 'reject' | 'cancel'; runId?: string; prompt?: string; model?: string;
  workspaceId?: string; repository?: string; profileId?: string; agentId?: string; feedback?: string;
  maxIterations?: number; maxDurationMs?: number; maxCostUsd?: number; maxTokens?: number; maxOutputTokens?: number; idempotencyKey?: string;
}
/** Query one visible run or aggregate every run visible to the current operator. */
export interface VscodeCostQueryPayload { runId?: string }
/** Discriminated client-to-bridge message union. */
export type VscodeInboundMessage =
  | { type: 'chat'; requestId: string; payload: VscodeChatPayload }
  | { type: 'inline-edit'; requestId: string; payload: VscodeInlineEditPayload }
  | { type: 'agent-session'; requestId: string; payload: VscodeAgentSessionPayload }
  | { type: 'cost-query'; requestId: string; payload: VscodeCostQueryPayload };
/** Discriminated bridge-to-client message union; every variant uses the same envelope. */
export type VscodeOutboundMessage =
  | { type: 'response' | 'stream-chunk' | 'usage'; requestId: string; payload: Record<string, unknown> }
  | { type: 'error'; requestId: string; payload: { message: string; status: number; code: string } };

/** Internal request sent through the authenticated platform HTTP router. */
export interface VscodeDispatchRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  authorization?: string;
  signal: AbortSignal;
  onEvent?: (event: Record<string, unknown>) => void;
}

/** Status and decoded body returned by the platform HTTP router. */
export interface VscodeDispatchResult {
  status: number;
  body: unknown;
}

/** Authentication, routing, and resource limits supplied by BridgeServer. */
export interface VscodeBridgeOptions {
  /** Re-evaluated for every message so token revocation and role changes take effect. */
  authorize(): boolean;
  /** Return a reason when the shared request limiter declines this message. */
  admit?(): string | undefined;
  authorization?: string;
  dispatch(request: VscodeDispatchRequest): Promise<VscodeDispatchResult>;
  maxMessageBytes?: number;
  maxInFlight?: number;
  requestTimeoutMs?: number;
}

interface InboundMessage {
  type: VscodeRequestType;
  requestId: string;
  payload: Record<string, unknown>;
}

class VscodeRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'invalid_request',
  ) { super(message); }
}

class WebSocketProtocolError extends Error {
  constructor(message: string, readonly closeCode: 1002 | 1003 | 1007 | 1009 = 1002) { super(message); }
}

function record(value: unknown, label = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VscodeRequestError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\0/.test(value)) {
    throw new VscodeRequestError(`${name} must be a nonempty string of at most ${max} characters`);
  }
  return value;
}

function optionalString(value: unknown, name: string, max: number): string | undefined {
  return value === undefined ? undefined : requiredString(value, name, max);
}

function optionalInteger(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new VscodeRequestError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value as number;
}

function optionalNumber(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new VscodeRequestError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function copyStrings(value: unknown, name: string, maxItems: number, maxLength: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) throw new VscodeRequestError(`${name} must contain at most ${maxItems} strings`);
  return value.map((item, index) => requiredString(item, `${name}[${index}]`, maxLength));
}

function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) {
    throw new VscodeRequestError('requestId must be a safe identifier of at most 120 characters');
  }
  return value;
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
  if (payload.length < 65_536) {
    const header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function decodeUtf8(payload: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(payload); }
  catch { throw new WebSocketProtocolError('Invalid UTF-8 payload', 1007); }
}

function safeError(error: unknown): { message: string; status: number; code: string } {
  if (error instanceof VscodeRequestError) {
    return { message: redactSecrets(error.message).slice(0, 1000), status: error.status, code: error.code };
  }
  if (error instanceof DOMException && error.name === 'AbortError') return { message: 'Request cancelled', status: 499, code: 'cancelled' };
  if (error instanceof Error && error.name === 'AbortError') return { message: 'Request cancelled', status: 499, code: 'cancelled' };
  return { message: 'The request could not be completed', status: 500, code: 'internal_error' };
}

function responseError(result: VscodeDispatchResult): never {
  const body = result.body && typeof result.body === 'object' ? result.body as Record<string, any> : {};
  const source = body.error && typeof body.error === 'object' ? body.error : body;
  const message = typeof source.message === 'string' ? source.message : `Platform request failed with status ${result.status}`;
  const code = typeof source.type === 'string' ? source.type : typeof source.code === 'string' ? source.code : 'platform_error';
  throw new VscodeRequestError(redactSecrets(message).slice(0, 1000), result.status, code);
}

/**
 * One RFC 6455 connection for the VS Code protocol. Client data must be masked;
 * text fragmentation and control frames are handled without accepting extensions.
 */
export class VscodeBridgeConnection {
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] | undefined;
  private fragmentBytes = 0;
  private stopped = false;
  private readonly active = new Map<string, AbortController>();
  private readonly maxMessageBytes: number;
  private readonly maxInFlight: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly socket: Duplex, private readonly options: VscodeBridgeOptions, head: Buffer = Buffer.alloc(0)) {
    this.maxMessageBytes = Math.min(Math.max(options.maxMessageBytes ?? VSCODE_MAX_MESSAGE_BYTES, 1024), 1_048_576);
    this.maxInFlight = Math.min(Math.max(options.maxInFlight ?? VSCODE_MAX_IN_FLIGHT, 1), 16);
    this.requestTimeoutMs = Math.min(Math.max(options.requestTimeoutMs ?? 600_000, 1000), 1_800_000);
    socket.on('data', this.onData);
    socket.once('end', this.cleanup);
    socket.once('close', this.cleanup);
    socket.once('error', this.cleanup);
    if (head.length) this.consume(head);
  }

  /** Send a bounded server close frame, abort active work, and release the socket. */
  close(code = 1001, reason = 'Server stopping'): void {
    if (this.stopped) return;
    this.sendClose(code, reason);
    this.cleanup();
    this.socket.end();
    setTimeout(() => { if (!this.socket.destroyed) this.socket.destroy(); }, 250).unref();
  }

  private readonly cleanup = (): void => {
    if (this.stopped) return;
    this.stopped = true;
    for (const controller of this.active.values()) controller.abort(new DOMException('Client disconnected', 'AbortError'));
    this.active.clear();
    this.fragments = undefined;
    this.buffer = Buffer.alloc(0);
  };

  private readonly onData = (chunk: Buffer): void => this.consume(chunk);

  private consume(chunk: Buffer): void {
    if (this.stopped) return;
    try {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
      for (;;) {
        const consumed = this.parseOne();
        if (!consumed) break;
        this.buffer = this.buffer.subarray(consumed);
      }
      if (this.buffer.length > this.maxMessageBytes + 14) throw new WebSocketProtocolError('WebSocket input exceeds the configured limit', 1009);
    } catch (error) {
      const failure = error instanceof WebSocketProtocolError ? error : new WebSocketProtocolError('Invalid WebSocket frame');
      this.sendClose(failure.closeCode, failure.message);
      this.cleanup();
      this.socket.end();
      setTimeout(() => { if (!this.socket.destroyed) this.socket.destroy(); }, 250).unref();
    }
  }

  private parseOne(): number {
    if (this.buffer.length < 2) return 0;
    const first = this.buffer[0]; const second = this.buffer[1];
    const fin = (first & 0x80) !== 0; const opcode = first & 0x0f;
    if ((first & 0x70) !== 0) throw new WebSocketProtocolError('WebSocket extensions were not negotiated');
    const masked = (second & 0x80) !== 0;
    if (!masked) throw new WebSocketProtocolError('Client WebSocket frames must be masked');
    let length = second & 0x7f; let offset = 2;
    if (length === 126) {
      if (this.buffer.length < 4) return 0;
      length = this.buffer.readUInt16BE(2); offset = 4;
      if (length < 126) throw new WebSocketProtocolError('Non-canonical WebSocket frame length');
    } else if (length === 127) {
      if (this.buffer.length < 10) return 0;
      const large = this.buffer.readBigUInt64BE(2); offset = 10;
      if ((large >> 63n) !== 0n) throw new WebSocketProtocolError('Invalid WebSocket frame length');
      if (large < 65_536n) throw new WebSocketProtocolError('Non-canonical WebSocket frame length');
      if (large > BigInt(this.maxMessageBytes)) throw new WebSocketProtocolError('WebSocket message is too large', 1009);
      length = Number(large);
    }
    const control = opcode >= 0x8;
    if (control && (!fin || length > 125)) throw new WebSocketProtocolError('Invalid WebSocket control frame');
    if (!control && length > this.maxMessageBytes) throw new WebSocketProtocolError('WebSocket message is too large', 1009);
    const total = offset + 4 + length;
    if (this.buffer.length < total) return 0;
    const mask = this.buffer.subarray(offset, offset + 4); offset += 4;
    const payload = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) payload[i] = this.buffer[offset + i] ^ mask[i & 3];
    this.handleFrame(opcode, fin, payload);
    return total;
  }

  private handleFrame(opcode: number, fin: boolean, payload: Buffer): void {
    if (opcode === 0x8) {
      if (payload.length === 1) throw new WebSocketProtocolError('Invalid close frame');
      if (payload.length >= 2) {
        const code = payload.readUInt16BE(0);
        const validCode = [1000, 1001, 1002, 1003].includes(code) || (code >= 1007 && code <= 1014) || (code >= 3000 && code < 5000);
        if (!validCode) throw new WebSocketProtocolError('Invalid close status');
        decodeUtf8(payload.subarray(2));
      }
      if (!this.stopped) this.socket.write(encodeFrame(0x8, payload));
      this.cleanup(); this.socket.end();
      setTimeout(() => { if (!this.socket.destroyed) this.socket.destroy(); }, 250).unref(); return;
    }
    if (opcode === 0x9) { this.socket.write(encodeFrame(0xA, payload)); return; }
    if (opcode === 0xA) return;
    if (opcode === 0x2) throw new WebSocketProtocolError('Binary messages are not supported', 1003);
    if (opcode === 0x1) {
      if (this.fragments) throw new WebSocketProtocolError('A fragmented message is already active');
      if (fin) { this.receiveText(decodeUtf8(payload)); return; }
      this.fragments = [payload]; this.fragmentBytes = payload.length; return;
    }
    if (opcode === 0x0) {
      if (!this.fragments) throw new WebSocketProtocolError('Unexpected continuation frame');
      this.fragmentBytes += payload.length;
      if (this.fragmentBytes > this.maxMessageBytes) throw new WebSocketProtocolError('WebSocket message is too large', 1009);
      this.fragments.push(payload);
      if (fin) {
        const complete = Buffer.concat(this.fragments, this.fragmentBytes);
        this.fragments = undefined; this.fragmentBytes = 0; this.receiveText(decodeUtf8(complete));
      }
      return;
    }
    throw new WebSocketProtocolError('Unsupported WebSocket opcode');
  }

  private receiveText(text: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { this.sendError('unknown', new VscodeRequestError('Message must be valid JSON')); return; }
    let message: InboundMessage;
    try {
      const value = record(parsed, 'message');
      const id = requestId(value.requestId);
      if (!['chat', 'inline-edit', 'agent-session', 'cost-query'].includes(String(value.type))) throw new VscodeRequestError('Unsupported VS Code request type');
      message = { type: value.type as VscodeRequestType, requestId: id, payload: record(value.payload) };
    } catch (error) {
      const id = parsed && typeof parsed === 'object' && typeof (parsed as any).requestId === 'string' ? String((parsed as any).requestId).slice(0, 120) : 'unknown';
      this.sendError(id, error); return;
    }
    if (this.active.has(message.requestId)) { this.sendError(message.requestId, new VscodeRequestError('requestId is already active', 409, 'request_conflict')); return; }
    if (this.active.size >= this.maxInFlight) { this.sendError(message.requestId, new VscodeRequestError('Too many concurrent VS Code requests', 429, 'concurrency_limit')); return; }
    const controller = new AbortController(); this.active.set(message.requestId, controller);
    const timer = setTimeout(() => controller.abort(new DOMException('Request deadline exceeded', 'AbortError')), this.requestTimeoutMs); timer.unref();
    void this.process(message, controller).catch(error => { if (!this.stopped) this.sendError(message.requestId, error); }).finally(() => {
      clearTimeout(timer); if (this.active.get(message.requestId) === controller) this.active.delete(message.requestId);
    });
  }

  private async process(message: InboundMessage, controller: AbortController): Promise<void> {
    if (!this.options.authorize()) {
      this.sendError(message.requestId, new VscodeRequestError('The VS Code bearer token is no longer authorized', 401, 'unauthorized'));
      this.close(1008, 'Authorization revoked'); return;
    }
    const admissionFailure = this.options.admit?.();
    if (admissionFailure) throw new VscodeRequestError(admissionFailure, 429, 'rate_limit_error');
    if (message.type === 'chat') await this.chat(message, controller);
    else if (message.type === 'inline-edit') await this.inlineEdit(message, controller);
    else if (message.type === 'agent-session') await this.agentSession(message, controller);
    else await this.costQuery(message, controller);
  }

  private async platform(request: Omit<VscodeDispatchRequest, 'authorization'>): Promise<VscodeDispatchResult> {
    const result = await this.options.dispatch({ ...request, authorization: this.options.authorization });
    if (result.status < 200 || result.status >= 300) responseError(result);
    return result;
  }

  private async session(payload: Record<string, unknown>, signal: AbortSignal, title: string, forceEphemeral = false): Promise<string> {
    const model = requiredString(payload.model, 'model', 200);
    const result = await this.platform({
      method: 'POST', path: '/v1/platform/sessions', signal,
      body: {
        model, title,
        retention: !forceEphemeral && payload.retention === 'retained' ? 'retained' : 'ephemeral',
        workspaceId: optionalString(payload.workspaceId, 'workspaceId', 300),
        profileId: optionalString(payload.profileId, 'profileId', 120),
        agentId: optionalString(payload.agentId, 'agentId', 120),
        ttlMs: optionalInteger(payload.ttlMs, 'ttlMs', 1000, 31_536_000_000),
      },
    });
    const id = (result.body as any)?.session?.id;
    if (typeof id !== 'string') throw new VscodeRequestError('Platform session creation returned an invalid response', 502, 'invalid_platform_response');
    return id;
  }

  private async streamedTurn(message: InboundMessage, sessionId: string, content: string, controller: AbortController): Promise<any> {
    const payload = message.payload;
    const body: Record<string, unknown> = {
      content, stream: true, requestId: message.requestId,
      model: optionalString(payload.model, 'model', 200),
      profileId: optionalString(payload.profileId, 'profileId', 120),
      agentId: optionalString(payload.agentId, 'agentId', 120),
      effort: optionalString(payload.effort, 'effort', 20),
      contextTokens: optionalInteger(payload.contextTokens, 'contextTokens', 1, 2_000_000),
      maxOutputTokens: optionalInteger(payload.maxOutputTokens, 'maxOutputTokens', 1, 8192),
      memoryIds: copyStrings(payload.memoryIds, 'memoryIds', 20, 120),
    };
    const result = await this.platform({
      method: 'POST', path: `/v1/platform/sessions/${encodeURIComponent(sessionId)}/messages`, body, signal: controller.signal,
      onEvent: event => {
        if (event.type === 'delta' && typeof event.delta === 'string') this.send('stream-chunk', message.requestId, { delta: event.delta });
      },
    });
    return result.body;
  }

  private async chat(message: InboundMessage, controller: AbortController): Promise<void> {
    const payload = message.payload;
    if (payload.action === 'cancel') {
      const target = requestId(payload.targetRequestId);
      const active = this.active.get(target);
      if (active && active !== controller) active.abort(new DOMException('Cancelled by client', 'AbortError'));
      this.send('response', message.requestId, { cancelled: Boolean(active && active !== controller), targetRequestId: target }); return;
    }
    const content = requiredString(payload.content, 'content', 100_000);
    const sessionId = payload.sessionId === undefined
      ? await this.session(payload, controller.signal, optionalString(payload.title, 'title', 200) || 'VS Code chat')
      : requiredString(payload.sessionId, 'sessionId', 120);
    const result = await this.streamedTurn(message, sessionId, content, controller);
    this.send('stream-chunk', message.requestId, { delta: '', done: true });
    this.send('response', message.requestId, { kind: 'chat', sessionId, ...record(result, 'platform response') });
  }

  private async inlineEdit(message: InboundMessage, controller: AbortController): Promise<void> {
    const payload = message.payload;
    const instruction = requiredString(payload.instruction, 'instruction', 10_000);
    const code = requiredString(payload.code, 'code', 80_000);
    const languageId = optionalString(payload.languageId, 'languageId', 100) || 'text';
    const filePath = optionalString(payload.filePath, 'filePath', 1000) || 'current editor selection';
    const sessionId = await this.session(payload, controller.signal, 'VS Code inline edit proposal', true);
    const prompt = [
      'Propose replacement code for the editor selection below.',
      'Do not run tools, modify files, or claim the proposal was applied. Return only the replacement code without Markdown fences.',
      `Language: ${languageId}`,
      `File label: ${filePath}`,
      `Requested change: ${instruction}`,
      'Current code:', code,
    ].join('\n');
    const result = await this.streamedTurn(message, sessionId, prompt, controller);
    const assistant = (result as any)?.assistantMessage?.content;
    if (typeof assistant !== 'string') throw new VscodeRequestError('Platform response did not contain an edit proposal', 502, 'invalid_platform_response');
    this.send('stream-chunk', message.requestId, { delta: '', done: true });
    this.send('response', message.requestId, { kind: 'inline-edit', sessionId, proposal: assistant, applyRequired: true });
  }

  private async agentSession(message: InboundMessage, controller: AbortController): Promise<void> {
    const payload = message.payload; const action = payload.action === undefined ? 'start' : requiredString(payload.action, 'action', 20);
    let result: VscodeDispatchResult;
    if (action === 'start') {
      result = await this.platform({
        method: 'POST', path: '/v1/platform/runs', signal: controller.signal,
        body: {
          prompt: requiredString(payload.prompt, 'prompt', 50_000),
          model: requiredString(payload.model, 'model', 200),
          mode: 'agent', requiresApproval: true,
          workspaceId: optionalString(payload.workspaceId, 'workspaceId', 300),
          repository: optionalString(payload.repository, 'repository', 300),
          profileId: optionalString(payload.profileId, 'profileId', 120),
          agentId: optionalString(payload.agentId, 'agentId', 120),
          maxIterations: optionalInteger(payload.maxIterations, 'maxIterations', 1, 10),
          maxDurationMs: optionalInteger(payload.maxDurationMs, 'maxDurationMs', 100, 1_800_000),
          maxCostUsd: optionalNumber(payload.maxCostUsd, 'maxCostUsd', 0, 100),
          maxTokens: optionalInteger(payload.maxTokens, 'maxTokens', 1, 500_000),
          maxOutputTokens: optionalInteger(payload.maxOutputTokens, 'maxOutputTokens', 1, 8192),
          idempotencyKey: optionalString(payload.idempotencyKey, 'idempotencyKey', 120),
        },
      });
    } else {
      const runId = requiredString(payload.runId, 'runId', 120);
      if (action === 'status') result = await this.platform({ method: 'GET', path: `/v1/platform/runs/${encodeURIComponent(runId)}`, signal: controller.signal });
      else if (['approve', 'reject', 'cancel'].includes(action)) result = await this.platform({
        method: 'POST', path: `/v1/platform/runs/${encodeURIComponent(runId)}/actions`, signal: controller.signal,
        body: { action, feedback: optionalString(payload.feedback, 'feedback', 2000) },
      });
      else throw new VscodeRequestError('agent-session action must be start, status, approve, reject, or cancel');
    }
    const body = record(result.body, 'platform response'); const run = body.run as Record<string, unknown> | undefined;
    this.send('response', message.requestId, { kind: 'agent-session', ...body });
    if (run && typeof run.costUsd === 'number' && typeof run.tokensConsumed === 'number') {
      this.send('usage', message.requestId, { runId: run.id, costUsd: run.costUsd, tokens: run.tokensConsumed, status: run.status });
    }
  }

  private async costQuery(message: InboundMessage, controller: AbortController): Promise<void> {
    const runId = optionalString(message.payload.runId, 'runId', 120);
    const result = await this.platform({ method: 'GET', path: runId ? `/v1/platform/runs/${encodeURIComponent(runId)}` : '/v1/platform/runs', signal: controller.signal });
    const body = record(result.body, 'platform response');
    const runs = runId ? [body.run] : Array.isArray(body.data) ? body.data : [];
    const usage = runs.reduce((sum, value) => {
      const run = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      if (typeof run.costUsd === 'number' && Number.isFinite(run.costUsd)) sum.costUsd += run.costUsd;
      if (typeof run.tokensConsumed === 'number' && Number.isFinite(run.tokensConsumed)) sum.tokens += run.tokensConsumed;
      return sum;
    }, { costUsd: 0, tokens: 0 });
    const payload = { ...(runId ? { runId } : {}), ...usage, runCount: runs.length };
    this.send('usage', message.requestId, payload);
    this.send('response', message.requestId, { kind: 'cost-query', ...payload });
  }

  private send(type: 'response' | 'stream-chunk' | 'usage', requestIdValue: string, payload: Record<string, unknown>): void {
    if (this.stopped) return;
    const encoded = Buffer.from(JSON.stringify({ type, requestId: requestIdValue, payload }), 'utf8');
    if (encoded.length > 1_048_576) { this.sendError(requestIdValue, new VscodeRequestError('Response exceeds the VS Code message limit', 502, 'response_too_large')); return; }
    this.socket.write(encodeFrame(0x1, encoded));
  }

  private sendError(requestIdValue: string, error: unknown): void {
    if (this.stopped) return;
    const failure = safeError(error);
    const payload = Buffer.from(JSON.stringify({ type: 'error', requestId: requestIdValue, payload: failure }), 'utf8');
    this.socket.write(encodeFrame(0x1, payload));
  }

  private sendClose(code: number, reason: string): void {
    if (this.stopped || this.socket.destroyed) return;
    const safeReason = reason.replace(/[^\x20-\x7e]/g, '?').slice(0, 123);
    const payload = Buffer.alloc(2 + Buffer.byteLength(safeReason)); payload.writeUInt16BE(code, 0); payload.write(safeReason, 2);
    try { this.socket.write(encodeFrame(0x8, payload)); } catch { /* closing */ }
  }
}
