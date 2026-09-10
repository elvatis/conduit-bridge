import { stdin as input, stdout as output } from 'node:process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { BridgeServer } from './server.js';
import { bearerAuthorization } from './config.js';
import type { BridgeConfig } from './types.js';
import { logger } from './logger.js';
import { assertSupportedPlatform } from './platform.js';
import { applyTuiKey, decodeKey, renderTui, type TuiKey, type TuiMessage, type TuiRunDetail, type TuiRunRow, type TuiState, type TuiWorkspaceRow } from './tui-render.js';

export type ChatCommand =
  | { type: 'help' }
  | { type: 'quit' }
  | { type: 'new' }
  | { type: 'models' }
  | { type: 'model'; id: string }
  | { type: 'stop' }
  | { type: 'run'; prompt: string }
  | { type: 'continue'; prompt: string; runId?: string }
  | { type: 'approve'; runId?: string }
  | { type: 'cancel'; runId?: string }
  | { type: 'workspaces' }
  | { type: 'status' }
  | { type: 'prompt'; text: string }
  | { type: 'empty' }
  | { type: 'unknown'; text: string };

export interface ChatModelRow { id: string; displayName?: string }
export interface ChatSession { id: string; model: string; title?: string; messages?: TuiMessage[] }
export interface ChatSessionRow { id: string; title: string; model?: string; updatedAt: number; messages?: TuiMessage[] }
export interface ChatTurnClient {
  listModels(): Promise<ChatModelRow[]>;
  createSession(model: string): Promise<ChatSession>;
  listSessions(): Promise<ChatSessionRow[]>;
  getSession(id: string): Promise<ChatSession & { messages: TuiMessage[] }>;
  listRuns(): Promise<TuiRunRow[]>;
  getRun(id: string): Promise<TuiRunDetail>;
  runAction(id: string, action: 'approve' | 'cancel' | 'retry' | 'continue', feedback?: string): Promise<void>;
  createRun(prompt: string, model?: string, mode?: 'chat' | 'plan' | 'agent', workspaceId?: string): Promise<{ id: string }>;
  listWorkspaces(): Promise<TuiWorkspaceRow[]>;
  gitSnapshot(workspaceId?: string): Promise<{ detected: boolean; branch: string; files: number; name: string }>;
  status(): Promise<{ version?: string; providers: Array<{ name: string; connected: boolean }> }>;
  send(sessionId: string, content: string, model: string, signal?: AbortSignal, onDelta?: (delta: string) => void): Promise<string>;
  cancel(sessionId: string): Promise<void>;
}

export interface TuiTerminal {
  columns: number;
  rows: number;
  color?: boolean;
  write(frame: string): void;
  readKey(): Promise<TuiKey | null>;
  close?(): void;
}

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
  if (name === 'run') return arg ? { type: 'run', prompt: arg } : { type: 'help' };
  if (name === 'continue') {
    const parts = arg.split(/\s+/);
    if (parts[0]?.startsWith('run-')) {
      return { type: 'continue', runId: parts[0], prompt: parts.slice(1).join(' ') };
    }
    return { type: 'continue', prompt: arg };
  }
  if (name === 'approve') return { type: 'approve', runId: arg || undefined };
  if (name === 'cancel') return { type: 'cancel', runId: arg || undefined };
  if (name === 'workspaces') return { type: 'workspaces' };
  if (name === 'status') return { type: 'status' };
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
      const body = await requestJson<{ session: { id: string; model?: string; title?: string } }>(new URL(`${root}/v1/platform/sessions`), {
        method: 'POST', headers, body: { model, title: 'CLI chat', retention: 'retained' },
      });
      return { id: body.session.id, model: body.session.model || model, title: body.session.title };
    },
    async listSessions() {
      const body = await requestJson<{ data?: Array<{ id: string; title: string; model?: string; updatedAt: number; messages?: TuiMessage[] }> }>(new URL(`${root}/v1/platform/sessions`), { headers });
      return body.data || [];
    },
    async getSession(id) {
      const body = await requestJson<{ session: { id: string; title?: string; model?: string; messages?: TuiMessage[] } }>(new URL(`${root}/v1/platform/sessions/${encodeURIComponent(id)}`), { headers });
      return { id: body.session.id, title: body.session.title, model: body.session.model || '', messages: (body.session.messages || []).map(message => ({ role: message.role, content: message.content, model: message.model, status: message.status })) };
    },
    async listRuns() {
      const body = await requestJson<{ data?: Array<{ id: string; status: string; input?: { prompt?: string; model?: string }; model?: string; steps?: unknown[]; costUsd?: number; tokensConsumed?: number; error?: string }> }>(new URL(`${root}/v1/platform/runs`), { headers });
      return (body.data || []).map(run => ({
        id: run.id,
        status: run.status,
        model: run.input?.model || run.model,
        prompt: run.input?.prompt || '',
        stepsCount: run.steps?.length,
        costUsd: run.costUsd,
        tokensConsumed: run.tokensConsumed,
        error: run.error,
      }));
    },
    async getRun(id: string) {
      const body = await requestJson<{ run: any }>(new URL(`${root}/v1/platform/runs/${encodeURIComponent(id)}`), { headers });
      const r = body.run;
      return {
        id: r.id,
        status: r.status,
        model: r.input?.model || r.model || '',
        prompt: r.input?.prompt || '',
        createdAt: r.createdAt || Date.now(),
        costUsd: r.costUsd || 0,
        tokensConsumed: r.tokensConsumed || 0,
        error: r.error,
        steps: (r.steps || []).map((s: any) => ({
          iteration: s.iteration,
          status: s.status,
          content: s.content,
          error: s.error,
          events: s.events,
        })),
        artifacts: r.artifacts,
      };
    },
    async runAction(id: string, action: 'approve' | 'cancel' | 'retry' | 'continue', feedback?: string) {
      await requestJson(new URL(`${root}/v1/platform/runs/${encodeURIComponent(id)}/actions`), {
        method: 'POST',
        headers,
        body: { action, feedback, operator: 'cli' },
      });
    },
    async createRun(prompt: string, model?: string, mode: 'chat' | 'plan' | 'agent' = 'agent', workspaceId?: string) {
      const body = await requestJson<{ run: { id: string } }>(new URL(`${root}/v1/platform/runs`), {
        method: 'POST',
        headers,
        body: { prompt, model, mode, workspaceId },
      });
      return { id: body.run.id };
    },
    async listWorkspaces() {
      const body = await requestJson<{ data?: Array<{ id: string; name: string; path: string; isDefault?: boolean }> }>(new URL(`${root}/v1/platform/workspaces`), { headers });
      return (body.data || []).map(w => ({ id: w.id, name: w.name || w.id, path: w.path || '', isDefault: w.isDefault }));
    },
    async gitSnapshot(workspaceId?: string) {
      try {
        let spaceId = workspaceId;
        if (!spaceId) {
          const spaces = await requestJson<{ data?: Array<{ id: string; name?: string; isDefault?: boolean }> }>(new URL(`${root}/v1/platform/workspaces`), { headers });
          const workspace = spaces.data?.find(item => item.isDefault) || spaces.data?.[0];
          spaceId = workspace?.id;
        }
        if (!spaceId) return { detected: false, branch: '', files: 0, name: '' };
        const snap = await requestJson<{ detected?: boolean; branch?: string; name?: string; files?: unknown[] }>(new URL(`${root}/api/git-workspace/snapshot?workspaceId=${encodeURIComponent(spaceId)}`), { headers });
        return { detected: Boolean(snap.detected), branch: snap.branch || '', files: Array.isArray(snap.files) ? snap.files.length : 0, name: snap.name || spaceId };
      } catch {
        return { detected: false, branch: '', files: 0, name: '' };
      }
    },
    async status() {
      try {
        return await requestJson<{ version?: string; providers: Array<{ name: string; connected: boolean }> }>(new URL(`${root}/v1/status`), { headers });
      } catch {
        return { providers: [] };
      }
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

function paint(terminal: TuiTerminal, state: TuiState): void {
  terminal.write(renderTui({ ...state, width: terminal.columns, height: terminal.rows }));
}

async function refreshExtras(client: ChatTurnClient, state: TuiState): Promise<TuiState> {
  const [sessions, runs, workspaces, git] = await Promise.all([
    client.listSessions ? client.listSessions().catch(() => state.sessions) : Promise.resolve(state.sessions),
    client.listRuns ? client.listRuns().catch(() => state.runs) : Promise.resolve(state.runs),
    client.listWorkspaces ? client.listWorkspaces().catch(() => state.workspaces) : Promise.resolve(state.workspaces),
    client.gitSnapshot ? client.gitSnapshot(state.activeWorkspaceId).catch(() => state.git) : Promise.resolve(state.git),
  ]);
  const activeWorkspaceId = state.activeWorkspaceId || workspaces?.find(w => w.isDefault)?.id || workspaces?.[0]?.id;
  return { ...state, sessions: sessions || state.sessions, runs: runs || state.runs, workspaces: workspaces || state.workspaces, git: git || state.git, activeWorkspaceId };
}

export async function runInteractiveChat(options: { client: ChatTurnClient; model?: string; terminal: TuiTerminal }): Promise<void> {
  const { client, terminal } = options;
  const models = await client.listModels();
  if (!models.length) throw new Error('No models are advertised. Connect a provider, then try again.');
  let model = options.model && models.some(item => item.id === options.model) ? options.model : preferredChatModel(models);
  if (!model) throw new Error('No models are advertised. Connect a provider, then try again.');
  const created = await client.createSession(model);
  let inFlight: AbortController | undefined;
  let state: TuiState = {
    view: 'chat', overlay: 'none', model, sessionId: created.id, sessionTitle: created.title || 'CLI chat',
    messages: [], input: '', cursor: 0, filter: '', selected: 0, models, sessions: [], runs: [],
    workspaces: [], runSelectedIndex: 0,
    git: { detected: false, branch: '', files: 0, name: '' }, host: '', notice: 'Ready', busy: false, streaming: '',
    width: terminal.columns, height: terminal.rows,
  };
  state = await refreshExtras(client, state);
  paint(terminal, state);

  const sendPrompt = async (text: string) => {
    inFlight = new AbortController();
    state = {
      ...state, busy: true, streaming: '', notice: 'Sending',
      messages: [...state.messages, { role: 'user', content: text }],
    };
    paint(terminal, state);
    try {
      const answer = await client.send(state.sessionId, text, state.model, inFlight.signal, delta => {
        state = { ...state, streaming: state.streaming + delta };
        paint(terminal, state);
      });
      state = {
        ...state, busy: false, streaming: '', notice: 'Ready',
        messages: [...state.messages, { role: 'assistant', content: answer, model: state.model }],
      };
    } catch (error) {
      const message = inFlight.signal.aborted ? 'Cancelled' : error instanceof Error ? error.message : String(error);
      state = { ...state, busy: false, streaming: '', notice: message };
    } finally {
      inFlight = undefined;
      paint(terminal, state);
    }
  };

  while (true) {
    const key = await terminal.readKey();
    if (!key) break;
    const previous = state.input;
    const next = applyTuiKey(state, key);
    state = { ...next.state, width: terminal.columns, height: terminal.rows };
    if (next.action === 'quit') break;
    if (next.action === 'cancel') {
      inFlight?.abort();
      await client.cancel(state.sessionId).catch(() => {});
      state = { ...state, busy: false, notice: 'Cancelled' };
    }
    if (next.action === 'new') {
      const session = await client.createSession(state.model);
      state = { ...state, sessionId: session.id, sessionTitle: session.title || 'CLI chat', messages: [], notice: 'New conversation' };
    }
    if (next.action === 'refresh') state = await refreshExtras(client, state);
    if (next.action === 'open-session') {
      const opened = await client.getSession(state.sessionId);
      state = {
        ...state, sessionTitle: opened.title || opened.id, model: opened.model || state.model,
        messages: opened.messages, view: 'chat', notice: `Resumed ${opened.title || opened.id}`,
      };
    }
    if (next.action === 'view-run' && next.payload) {
      try {
        const detail = await client.getRun(next.payload);
        state = { ...state, selectedRunDetail: detail, view: 'run-detail', notice: `Run ${detail.id}` };
      } catch (err) {
        state = { ...state, notice: `Failed to load run: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'approve-run' && next.payload) {
      try {
        await client.runAction(next.payload, 'approve');
        state = { ...state, notice: `Approved run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Approval failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'cancel-run' && next.payload) {
      try {
        await client.runAction(next.payload, 'cancel');
        state = { ...state, notice: `Cancelled run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Cancel failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'retry-run' && next.payload) {
      try {
        await client.runAction(next.payload, 'retry');
        state = { ...state, notice: `Retried run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Retry failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'continue-run' && next.payload) {
      try {
        await client.runAction(next.payload, 'continue', 'Continue execution');
        state = { ...state, notice: `Continued run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Continue failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'select-workspace' && next.payload) {
      state.activeWorkspaceId = next.payload;
      try {
        state.git = await client.gitSnapshot(next.payload);
      } catch { /* ignore */ }
    }
    if (next.action === 'send') {
      const raw = next.payload ?? previous;
      const command = parseChatCommand(raw);
      if (command.type === 'quit') break;
      if (command.type === 'help') state = { ...state, view: 'help' };
      else if (command.type === 'new') {
        const session = await client.createSession(state.model);
        state = { ...state, sessionId: session.id, sessionTitle: session.title || 'CLI chat', messages: [], notice: 'New conversation' };
      } else if (command.type === 'models') state = { ...state, overlay: 'models', filter: '', selected: 0 };
      else if (command.type === 'workspaces') state = { ...state, overlay: 'workspaces', filter: '', selected: 0 };
      else if (command.type === 'stop') {
        inFlight?.abort();
        await client.cancel(state.sessionId).catch(() => {});
        state = { ...state, busy: false, notice: 'Cancelled' };
      } else if (command.type === 'model') {
        if (!state.models.some(item => item.id === command.id)) state = { ...state, notice: `Unknown model ${command.id}` };
        else state = { ...state, model: command.id, notice: `Next reply uses ${command.id}` };
      } else if (command.type === 'status') {
        try {
          const st = await client.status();
          const provs = st.providers.map(p => `${p.connected ? '✓' : '✗'} ${p.name}`).join('  ');
          state = {
            ...state,
            notice: `conduit-bridge v${st.version || '0.10.0'}`,
            messages: [...state.messages, { role: 'user', content: '/status' }, { role: 'assistant', content: `conduit-bridge v${st.version || '0.10.0'}\nProviders: ${provs || 'None'}` }],
          };
        } catch (err) {
          state = { ...state, notice: `Status failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      } else if (command.type === 'run') {
        try {
          const created = await client.createRun(command.prompt, state.model, 'agent', state.activeWorkspaceId);
          state = {
            ...state,
            notice: `Started run ${created.id}`,
            messages: [...state.messages, { role: 'user', content: `/run ${command.prompt}` }, { role: 'assistant', content: `Created run ${created.id}. Press Ctrl+R to inspect runs.` }],
          };
          state = await refreshExtras(client, state);
        } catch (err) {
          state = { ...state, notice: `Failed to create run: ${err instanceof Error ? err.message : String(err)}` };
        }
      } else if (command.type === 'continue') {
        const targetId = command.runId || state.selectedRunDetail?.id || state.runs[state.runSelectedIndex]?.id || state.runs[0]?.id;
        if (!targetId) {
          state = { ...state, notice: 'No run selected to continue' };
        } else {
          try {
            await client.runAction(targetId, 'continue', command.prompt || 'Continue execution');
            state = {
              ...state,
              notice: `Continued run ${targetId}`,
              messages: [...state.messages, { role: 'user', content: `/continue ${command.prompt || ''}`.trim() }, { role: 'assistant', content: `Resumed execution for ${targetId}.` }],
            };
            state = await refreshExtras(client, state);
            if (state.selectedRunDetail?.id === targetId) {
              state.selectedRunDetail = await client.getRun(targetId).catch(() => state.selectedRunDetail);
            }
          } catch (err) {
            state = { ...state, notice: `Continue failed: ${err instanceof Error ? err.message : String(err)}` };
          }
        }
      } else if (command.type === 'approve') {
        const targetId = command.runId || state.runs.find(r => r.status === 'waiting_approval')?.id || state.selectedRunDetail?.id || state.runs[state.runSelectedIndex]?.id;
        if (!targetId) {
          state = { ...state, notice: 'No run awaiting approval' };
        } else {
          try {
            await client.runAction(targetId, 'approve');
            state = { ...state, notice: `Approved run ${targetId}` };
            state = await refreshExtras(client, state);
            if (state.selectedRunDetail?.id === targetId) {
              state.selectedRunDetail = await client.getRun(targetId).catch(() => state.selectedRunDetail);
            }
          } catch (err) {
            state = { ...state, notice: `Approve failed: ${err instanceof Error ? err.message : String(err)}` };
          }
        }
      } else if (command.type === 'cancel') {
        const targetId = command.runId || state.runs.find(r => r.status === 'running')?.id || state.selectedRunDetail?.id || state.runs[state.runSelectedIndex]?.id;
        if (!targetId) {
          state = { ...state, notice: 'No active run to cancel' };
        } else {
          try {
            await client.runAction(targetId, 'cancel');
            state = { ...state, notice: `Cancelled run ${targetId}` };
            state = await refreshExtras(client, state);
            if (state.selectedRunDetail?.id === targetId) {
              state.selectedRunDetail = await client.getRun(targetId).catch(() => state.selectedRunDetail);
            }
          } catch (err) {
            state = { ...state, notice: `Cancel failed: ${err instanceof Error ? err.message : String(err)}` };
          }
        }
      } else if (command.type === 'unknown') state = { ...state, notice: `Unknown command ${command.text}` };
      else if (command.type === 'prompt') void sendPrompt(command.text);
    }
    paint(terminal, state);
  }
}

function createStdinTerminal(): TuiTerminal & { close(): void } {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Interactive chat needs a real terminal. Run this from a console, not a pipe.');
  }
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  output.write('\x1b[?1049h');
  let buffer = '';
  const pending: TuiKey[] = [];
  let waiting: ((key: TuiKey | null) => void) | undefined;
  const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined };
  const push = (key: TuiKey) => {
    if (waiting) { const resume = waiting; waiting = undefined; resume(key); }
    else pending.push(key);
  };
  const onData = (chunk: string) => {
    buffer += chunk;
    while (buffer) {
      if (buffer.startsWith('\x1b[')) {
        if (buffer.length < 3) break;
        const key = decodeKey(buffer.slice(0, 3));
        buffer = buffer.slice(3);
        if (key) push(key);
        continue;
      }
      if (buffer.startsWith('\x1b')) {
        if (buffer.length === 1) {
          if (!timer.id) timer.id = setTimeout(() => {
            timer.id = undefined;
            if (buffer === '\x1b') { buffer = ''; push({ type: 'escape' }); }
          }, 20);
          break;
        }
        buffer = buffer.slice(1);
        push({ type: 'escape' });
        continue;
      }
      const key = decodeKey(buffer[0]);
      buffer = buffer.slice(1);
      if (key) push(key);
    }
  };
  input.on('data', onData);
  return {
    get columns() { return output.columns || 80; },
    get rows() { return output.rows || 24; },
    color: true,
    write: frame => { output.write(frame); },
    readKey: () => new Promise(resolve => {
      if (pending.length) resolve(pending.shift()!);
      else waiting = resolve;
    }),
    close() {
      input.off('data', onData);
      if (timer.id) clearTimeout(timer.id);
      waiting?.(null);
      try { input.setRawMode(false); } catch { /* already closed */ }
      output.write('\x1b[?25h\x1b[?1049l');
    },
  };
}

export async function runChatCommand(cfg: BridgeConfig, flags: { model?: string } = {}): Promise<void> {
  assertSupportedPlatform();
  const baseUrl = `http://${cfg.host}:${cfg.port}`;
  const headers = bearerAuthorization(cfg.authToken);
  let stop: (() => Promise<void>) | undefined;
  if (!await probeHealth(baseUrl, headers)) {
    logger.info(`No listener on ${cfg.host}:${cfg.port}; starting one for this workspace`);
    const server = new BridgeServer(cfg);
    await server.start();
    stop = async () => { await server.stop(); };
  } else {
    logger.info(`Attached to existing listener on ${cfg.host}:${cfg.port}`);
  }
  const terminal = createStdinTerminal();
  try {
    await runInteractiveChat({
      client: createHttpChatClient(baseUrl, headers),
      model: flags.model,
      terminal,
    });
  } finally {
    terminal.close();
    if (stop) await stop();
  }
}
