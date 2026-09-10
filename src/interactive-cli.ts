import { stdin as input, stdout as output } from 'node:process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { bearerAuthorization } from './config.js';
import type { BridgeConfig, ExecutionEvent } from './types.js';
import { logger } from './logger.js';
import { assertSupportedPlatform } from './platform.js';
import { cliEntryPath, ensureBridgeListener, spawnBridgeDaemon } from './bridge-listener.js';
import { unconfinedAgentProviders } from './cli-mode.js';
import {
  applyTuiKey,
  decodeKey,
  estimateTokens,
  formatTokenCount,
  renderProgressBar,
  renderTui,
  renderTuiLines,
  TuiDifferentialRenderer,
  type TuiInsightRow,
  type TuiKey,
  type TuiMessage,
  type TuiModelRow,
  type TuiRunDetail,
  type TuiRunRow,
  type TuiState,
  type TuiWorkspaceRow,
  type TuiInferenceStatus,
  type TuiPendingApproval,
  type TuiTurnMetrics,
} from './tui-render.js';

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
  | { type: 'rollback'; runId?: string }
  | { type: 'workspaces' }
  | { type: 'insights' }
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
  runAction(id: string, action: 'approve' | 'cancel' | 'retry' | 'continue' | 'rollback', feedback?: string): Promise<void>;
  createRun(prompt: string, model?: string, mode?: 'chat' | 'plan' | 'agent', workspaceId?: string): Promise<{ id: string }>;
  listWorkspaces(): Promise<TuiWorkspaceRow[]>;
  gitSnapshot(workspaceId?: string): Promise<{ detected: boolean; branch: string; files: number; name: string }>;
  listInsights?(): Promise<TuiInsightRow[]>;
  status(): Promise<{ version?: string; providers: Array<{ name: string; connected: boolean }> }>;
  send(sessionId: string, content: string, model: string, signal?: AbortSignal, onDelta?: (delta: string) => void, onEvent?: (event: ExecutionEvent) => void): Promise<string>;
  cancel(sessionId: string): Promise<void>;
}

export interface TuiTerminal {
  columns: number;
  rows: number;
  color?: boolean;
  write(frame: string): void;
  readKey(): Promise<TuiKey | null>;
  close?(): void;
  onResize?(handler: () => void): () => void;
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
  if (name === 'rollback') return { type: 'rollback', runId: arg || undefined };
  if (name === 'workspaces') return { type: 'workspaces' };
  if (name === 'insights') return { type: 'insights' };
  if (name === 'status') return { type: 'status' };
  return { type: 'unknown', text };
}

export function preferredChatModel(models: ChatModelRow[]): string | undefined {
  const rank = (id: string) => id.startsWith('cli-') ? 0 : /^(lmstudio|bitnet)(\/|$)/.test(id) ? 1 : 2;
  return [...models].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))[0]?.id;
}

export function parseSseChunk(chunk: string): { deltas: string[]; events: ExecutionEvent[]; done?: { assistantMessage?: { content?: string } }; rest: string } {
  const deltas: string[] = [];
  const events: ExecutionEvent[] = [];
  let done: { assistantMessage?: { content?: string } } | undefined;
  const parts = chunk.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const frame of parts) {
    const line = frame.split('\n').find(item => item.startsWith('data:'));
    if (!line) continue;
    const payload = line.slice(5).trim();

    // The chat endpoint closes with a bare sentinel, not JSON. Without this it
    // reaches JSON.parse, throws, and is swallowed by the catch below, so the
    // stream ends with no `done` and the caller keeps whatever it accumulated.
    if (payload === '[DONE]') {
      done ??= {};
      continue;
    }

    try {
      const event = JSON.parse(payload) as {
        type?: string;
        delta?: string;
        assistantMessage?: { content?: string };
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        executionEvent?: ExecutionEvent;
        event?: ExecutionEvent;
      };

      const ev = event.executionEvent || (event.type === 'execution_event' ? event.event : undefined);
      if (ev && typeof ev === 'object' && typeof ev.kind === 'string') {
        events.push(ev);
      }

      // Two wire formats reach this parser and both must work. The platform
      // session endpoint sends {type:'delta', delta}; the chat endpoint at
      // /v1/chat/completions sends OpenAI-shaped chunks with no `type` field at
      // all (src/server.ts:2099-2104). This function only understood the first,
      // while the client posts to the second (:317), so onDelta never fired:
      // the reply stayed empty and every counter that hangs off a delta stayed
      // at its initial value. That is the whole of the reported blind flight.
      if (event.type === 'delta' && typeof event.delta === 'string') {
        deltas.push(event.delta);
      } else if (event.type === 'done') {
        done = event;
      } else if (Array.isArray(event.choices)) {
        for (const choice of event.choices) {
          const content = choice?.delta?.content;
          if (typeof content === 'string' && content.length) deltas.push(content);
          // finish_reason marks the last chunk. Record completion here as well,
          // so a stream cut off before the sentinel still terminates cleanly.
          if (choice?.finish_reason) done ??= {};
        }
      }
    } catch { /* ignore a truncated or non-JSON frame */ }
  }
  return { deltas, events, done, rest };
}

/** A short, human-readable form of whatever a rejected request threw. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

export function createHttpChatClient(
  baseUrl: string,
  authHeaders: Record<string, string> = {},
  options: { allowUnconfined?: boolean } = {},
): ChatTurnClient {
  const url = new URL(baseUrl);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? httpsRequest : httpRequest;
  const requestJson = <T>(method: string, path: string, body?: unknown): Promise<T> =>
    new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const req = transport(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path,
          method,
          headers: {
            ...authHeaders,
            ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          },
        },
        res => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { text += chunk; });
          res.on('end', () => {
            if ((res.statusCode ?? 500) >= 400) {
              return reject(new Error(`HTTP ${res.statusCode} from ${path}: ${text.slice(0, 160)}`));
            }
            if (!text.trim()) return resolve({} as T);
            try {
              resolve(JSON.parse(text) as T);
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });

  return {
    async listModels() {
      const body = await requestJson<{ data?: Array<{ id: string; name?: string; displayName?: string }> }>('GET', '/v1/models').catch(() => ({ data: [] }));
      return (body.data || []).map(item => ({ id: item.id, displayName: item.displayName || item.name || item.id }));
    },
    async createSession(model: string) {
      try {
        const body = await requestJson<ChatSession | { session: ChatSession }>('POST', '/v1/chat/sessions', { model });
        return (body as any).session || body;
      } catch {
        try {
          const body = await requestJson<{ session?: ChatSession; data?: ChatSession }>('POST', '/v1/platform/sessions', { model, title: 'CLI chat', retention: 'retained' });
          const session = body.session || body.data;
          if (session?.id) return { id: session.id, model: session.model || model, title: session.title || 'CLI chat' };
        } catch {
          // Fallback to local session
        }
        return { id: `session-${Date.now()}`, model, title: 'CLI chat' };
      }
    },
    async listSessions() {
      try {
        const body = await requestJson<{ data?: ChatSessionRow[] }>('GET', '/v1/chat/sessions');
        return body.data || [];
      } catch {
        try {
          const body = await requestJson<{ data?: ChatSessionRow[] }>('GET', '/v1/platform/sessions');
          return body.data || [];
        } catch {
          return [];
        }
      }
    },
    async getSession(id: string) {
      try {
        const body = await requestJson<{ data?: ChatSession & { messages: TuiMessage[] } } | (ChatSession & { messages: TuiMessage[] })>('GET', `/v1/chat/sessions/${id}`);
        return (body as any).data || body;
      } catch {
        try {
          const body = await requestJson<{ session?: ChatSession & { messages: TuiMessage[] } } | (ChatSession & { messages: TuiMessage[] })>('GET', `/v1/platform/sessions/${id}`);
          return (body as any).session || (body as any).data || body;
        } catch {
          return { id, model: 'gpt-4o', title: 'Chat session', messages: [] };
        }
      }
    },
    async listRuns() {
      try {
        const body = await requestJson<{ runs?: TuiRunRow[]; data?: TuiRunRow[] }>('GET', '/v1/runs');
        return body.runs || body.data || [];
      } catch {
        try {
          const body = await requestJson<{ data?: TuiRunRow[] }>('GET', '/v1/platform/runs');
          return body.data || [];
        } catch {
          return [];
        }
      }
    },
    async getRun(id: string) {
      try {
        const body = await requestJson<{ run?: TuiRunDetail; data?: TuiRunDetail } | TuiRunDetail>('GET', `/v1/runs/${id}`);
        return (body as any).run || (body as any).data || body;
      } catch {
        const body = await requestJson<{ run?: TuiRunDetail; data?: TuiRunDetail } | TuiRunDetail>('GET', `/v1/platform/runs/${id}`).catch(() => null);
        return (body as any)?.run || (body as any)?.data || body || { id, prompt: '', model: '', status: 'failed', stepCount: 0, steps: [] };
      }
    },
    async runAction(id: string, action: 'approve' | 'cancel' | 'retry' | 'continue', feedback?: string) {
      // The second catch used to be empty, so a rejected approval and a granted
      // one were indistinguishable to the caller and the UI reported success
      // either way. The fallback to the platform route stays, because both
      // endpoints are live, but a failure of BOTH is now an error.
      try {
        await requestJson('POST', `/v1/platform/runs/${id}/actions`, { action, feedback });
      } catch (primary) {
        try {
          await requestJson('POST', `/v1/platform/runs/${id}/${action}`, feedback ? { feedback } : {});
        } catch {
          throw new Error(`Run ${id}: ${action} was refused (${describeError(primary)})`);
        }
      }
    },
    async createRun(prompt: string, model?: string, mode?: 'chat' | 'plan' | 'agent', workspaceId?: string) {
      // A fabricated identifier is worse than an error. The previous version
      // fell back to `run-${Date.now()}` on every failure path, so a run that
      // never started still produced an id, the UI showed it as started, and
      // every later poll for that id quietly found nothing. The failure
      // reported success, which is the direction nobody notices.
      const body: Record<string, any> = { prompt, model, mode: mode || 'agent', workspaceId };
      if (options.allowUnconfined) body.allowUnconfined = true;
      const idOf = (res: unknown): string | undefined => {
        const value = res as { id?: unknown; run?: { id?: unknown } } | null;
        const found = value?.run?.id ?? value?.id;
        return typeof found === 'string' && found ? found : undefined;
      };

      let primary: unknown;
      try {
        const id = idOf(await requestJson<unknown>('POST', '/v1/runs', body));
        if (id) return { id };
        primary = new Error('the response carried no run id');
      } catch (err) {
        primary = err;
      }

      const id = idOf(await requestJson<unknown>('POST', '/v1/platform/runs', body).catch(() => {
        throw new Error(`The run could not be started: ${describeError(primary)}`);
      }));
      if (!id) throw new Error('The run could not be started: the response carried no run id');
      return { id };
    },
    async listWorkspaces() {
      const body = await requestJson<{ workspaces?: TuiWorkspaceRow[]; data?: TuiWorkspaceRow[] }>('GET', '/v1/workspaces').catch(() => ({ workspaces: [], data: [] }));
      return body.workspaces || body.data || [];
    },
    async gitSnapshot(workspaceId?: string) {
      const paths = [
        workspaceId ? `/v1/workspaces/${workspaceId}/git` : '/v1/git',
        workspaceId ? `/api/git-workspace/snapshot?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/git-workspace/snapshot',
      ];
      for (const p of paths) {
        try {
          const res = await requestJson<any>('GET', p);
          if (res) {
            return {
              detected: Boolean(res.detected),
              branch: res.branch || '',
              files: typeof res.files === 'number' ? res.files : Array.isArray(res.files) ? res.files.length : 0,
              name: res.name || '',
            };
          }
        } catch {
          // try next path
        }
      }
      return { detected: false, branch: '', files: 0, name: '' };
    },
    async listInsights() {
      try {
        const body = await requestJson<{ insights?: TuiInsightRow[]; data?: TuiInsightRow[] }>('GET', '/v1/insights');
        return body.insights || body.data || [];
      } catch {
        try {
          const body = await requestJson<{ summaries?: TuiInsightRow[]; data?: TuiInsightRow[] }>('GET', '/v1/platform/insights');
          return body.summaries || body.data || [];
        } catch {
          return [];
        }
      }
    },
    async status() {
      try {
        return await requestJson<{ version?: string; providers: Array<{ name: string; connected: boolean }> }>('GET', '/v1/system/status');
      } catch {
        try {
          return await requestJson<{ version?: string; providers: Array<{ name: string; connected: boolean }> }>('GET', '/v1/status');
        } catch {
          return { version: '0.10.0', providers: [] };
        }
      }
    },
    send(sessionId: string, content: string, model: string, signal?: AbortSignal, onDelta?: (delta: string) => void, onEvent?: (event: ExecutionEvent) => void) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          sessionId,
          model,
          stream: true,
          messages: [{ role: 'user', content }],
          ...(options.allowUnconfined ? { allowUnconfined: true } : {}),
        });
        const req = transport(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              ...authHeaders,
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
              accept: 'text/event-stream',
            },
            signal,
          },
          (res: IncomingMessage) => {
            if ((res.statusCode ?? 500) >= 400) {
              let text = '';
              res.setEncoding('utf8');
              res.on('data', chunk => { text += chunk; });
              res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 160)}`)));
              return;
            }
            let buffer = '';
            let reply = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
              buffer += chunk;
              const parsed = parseSseChunk(buffer);
              buffer = parsed.rest;
              for (const ev of parsed.events || []) {
                onEvent?.(ev);
              }
              for (const delta of parsed.deltas) {
                reply += delta;
                onDelta?.(delta);
              }
              if (parsed.done?.assistantMessage?.content) {
                reply = parsed.done.assistantMessage.content;
              }
            });
            res.on('end', () => resolve(reply));
          }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    },
    async cancel(sessionId: string) {
      await requestJson('POST', `/v1/chat/sessions/${sessionId}/cancel`, {}).catch(() => {});
    },
  };
}

export async function probeHealth(baseUrl: string, authHeaders: Record<string, string> = {}): Promise<boolean> {
  const url = new URL(baseUrl);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? httpsRequest : httpRequest;
  return new Promise(resolve => {
    const req = transport(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/v1/models',
        method: 'GET',
        headers: authHeaders,
        timeout: 1000,
      },
      res => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function refreshExtras(client: ChatTurnClient, state: TuiState, options?: { light?: boolean }): Promise<TuiState> {
  const startProbe = Date.now();
  const light = options?.light === true;
  const [sessions, runs, workspaces, git, insights] = await Promise.all([
    !light && client.listSessions ? client.listSessions().catch(() => state.sessions) : Promise.resolve(state.sessions),
    client.listRuns ? client.listRuns().catch(() => state.runs) : Promise.resolve(state.runs),
    !light && client.listWorkspaces ? client.listWorkspaces().catch(() => state.workspaces) : Promise.resolve(state.workspaces),
    !light && client.gitSnapshot ? client.gitSnapshot(state.activeWorkspaceId).catch(() => state.git) : Promise.resolve(state.git),
    !light && client.listInsights ? client.listInsights().catch(() => state.insights || []) : Promise.resolve(state.insights || []),
  ]);
  const latencyMs = Math.max(8, Math.min(250, Date.now() - startProbe));
  const activeWorkspaceId = state.activeWorkspaceId || workspaces?.find(w => w.isDefault)?.id || workspaces?.[0]?.id;

  let pendingApproval = state.pendingApproval;
  const waitingRun = (runs || []).find(r => r.status === 'waiting_approval');
  if (waitingRun) {
    if (!pendingApproval || pendingApproval.runId !== waitingRun.id) {
      pendingApproval = {
        runId: waitingRun.id,
        summary: `Run ${waitingRun.id} requires human approval: ${waitingRun.prompt}`,
      };
    }
  } else if (pendingApproval && !(runs || []).some(r => r.id === pendingApproval?.runId && r.status === 'waiting_approval')) {
    pendingApproval = undefined;
  }

  return {
    ...state,
    sessions: sessions || state.sessions,
    runs: runs || state.runs,
    workspaces: workspaces || state.workspaces,
    git: git || state.git,
    insights: (insights && insights.length ? insights : state.insights) || [],
    latencyMs,
    activeWorkspaceId,
    pendingApproval,
    history: state.history || [],
    historyIndex: state.historyIndex ?? -1,
  };
}

export async function runInteractiveChat(options: { client: ChatTurnClient; model?: string; terminal: TuiTerminal }): Promise<void> {
  const { client, terminal } = options;
  const models = await client.listModels();
  if (!models.length) throw new Error('No models are advertised. Connect a provider, then try again.');
  let model = options.model && models.some(item => item.id === options.model) ? options.model : preferredChatModel(models);
  if (!model) throw new Error('No models are advertised. Connect a provider, then try again.');
  const resolvedModel = model;
  const created = await client.createSession(resolvedModel).catch(() => ({
    id: `session-${Date.now()}`,
    model: resolvedModel,
    title: 'CLI chat',
  }));
  let inFlight: AbortController | undefined;
  let busyTimer: NodeJS.Timeout | undefined;

  let state: TuiState = {
    view: 'chat',
    overlay: 'none',
    model,
    sessionId: created.id,
    sessionTitle: created.title || 'CLI chat',
    messages: [],
    input: '',
    cursor: 0,
    filter: '',
    selected: 0,
    models,
    sessions: [],
    runs: [],
    workspaces: [],
    runSelectedIndex: 0,
    git: { detected: false, branch: '', files: 0, name: '' },
    host: '',
    notice: 'Ready',
    busy: false,
    streaming: '',
    status: 'idle',
    tokenCount: 0,
    tokensPerSec: 0,
    latencyMs: 22,
    history: [],
    historyIndex: -1,
    chatScroll: 0,
    chatStickToBottom: true,
    width: terminal.columns,
    height: terminal.rows,
  };

  const screenBuffer = new TuiDifferentialRenderer();

  let dirty = false;
  let paintTimer: NodeJS.Timeout | undefined;

  const flushPaint = () => {
    if (paintTimer) {
      clearTimeout(paintTimer);
      paintTimer = undefined;
    }
    if (!dirty) return;
    dirty = false;
    const { lines, cursor } = renderTuiLines({ ...state, width: terminal.columns, height: terminal.rows });
    screenBuffer.render(terminal, lines, cursor);
  };

  const requestPaint = (immediate = false) => {
    dirty = true;
    if (immediate) {
      flushPaint();
      return;
    }
    if (!paintTimer) {
      paintTimer = setTimeout(() => {
        paintTimer = undefined;
        flushPaint();
      }, 16); // 60 FPS frame throttle
      paintTimer.unref?.();
    }
  };

  const stopResize = terminal.onResize?.(() => {
    state = { ...state, width: terminal.columns, height: terminal.rows };
    screenBuffer.reset();
    requestPaint(true);
  });

  state = await refreshExtras(client, state);
  requestPaint(true);

  const startBusyTimer = () => {
    if (busyTimer) clearInterval(busyTimer);
    busyTimer = setInterval(() => {
      if (!state.busy) {
        if (busyTimer) clearInterval(busyTimer);
        return;
      }
      state = { ...state, spinnerFrame: (state.spinnerFrame || 0) + 1 };
      requestPaint();
    }, 80);
    busyTimer.unref?.();
  };

  const stopBusyTimer = () => {
    if (busyTimer) {
      clearInterval(busyTimer);
      busyTimer = undefined;
    }
  };

  const sendPrompt = async (text: string) => {
    inFlight = new AbortController();
    const startTime = Date.now();
    let tokenCount = 0;
    const inputTokens = estimateTokens(text);

    // Synchronize prompt history
    const history = state.history ? [...state.history] : [];
    if (!history.length || history[history.length - 1] !== text) {
      history.push(text);
    }

    state = {
      ...state,
      busy: true,
      status: 'thinking',
      busyStartTime: startTime,
      inferenceStartTime: startTime,
      tokenCount: 0,
      tokensPerSec: 0,
      spinnerFrame: 0,
      streaming: '',
      currentTool: undefined,
      notice: `Thinking [${state.model}]...`,
      messages: [...state.messages, { role: 'user', content: text }],
      history,
      historyIndex: -1,
      draftInput: undefined,
      chatScroll: 0,
      chatStickToBottom: true,
    };
    requestPaint(true);
    startBusyTimer();

    try {
      const onEvent = (ev: ExecutionEvent) => {
        let currentTool = state.currentTool;
        let status: TuiInferenceStatus = state.status || 'streaming';
        if (ev.kind === 'command') {
          status = 'tool_execution';
          const toolName = ev.command ? ev.command.trim().split(/\s+/)[0] : 'command';
          currentTool = {
            name: toolName,
            target: ev.command,
            status: ev.status === 'completed' ? 'completed' : ev.status === 'failed' ? 'failed' : 'running',
          };
        }
        state = {
          ...state,
          status: status === 'tool_execution' || status === 'diff_apply' ? status : (state.status || 'streaming'),
          currentTool,
          notice: status === 'tool_execution'
            ? `Tool: ${currentTool?.name || 'execution'}...`
            : status === 'diff_apply'
            ? 'Applying diff...'
            : state.notice,
        };
        requestPaint();
      };

      const answer = await client.send(state.sessionId, text, state.model, inFlight.signal, delta => {
        const chunkTokens = Math.max(1, Math.round(delta.length / 4));
        tokenCount += chunkTokens;
        const elapsed = Math.max(1, Date.now() - startTime);
        const tps = parseFloat(((tokenCount / elapsed) * 1000).toFixed(1));

        let currentTool = state.currentTool;
        let status: TuiInferenceStatus = state.status || 'streaming';
        if (!currentTool || currentTool.status === 'completed') {
          if (delta.includes('TOOL:') || delta.includes('Executing tool:')) {
            status = 'tool_execution';
            const match = delta.match(/(?:TOOL:|Executing tool:)\s*([a-zA-Z0-9_-]+)/);
            if (match) currentTool = { name: match[1], status: 'running' };
          } else if (delta.includes('<<<DIFF') || delta.includes('--- a/') || delta.includes('+++ b/')) {
            status = 'diff_apply';
          }
        }

        state = {
          ...state,
          status: status === 'tool_execution' || status === 'diff_apply' ? status : 'streaming',
          tokenCount,
          tokensPerSec: tps,
          streaming: state.streaming + delta,
          currentTool,
          notice: status === 'tool_execution'
            ? `Tool: ${currentTool?.name || 'execution'}...`
            : status === 'diff_apply'
            ? 'Applying diff...'
            : `Streaming [${state.model} | ${(elapsed / 1000).toFixed(1)}s | ${tps} t/s]`,
        };
        requestPaint();
      }, onEvent);
      stopBusyTimer();
      const elapsed = Date.now() - startTime;
      const tps = tokenCount > 0 && elapsed > 0 ? parseFloat(((tokenCount / elapsed) * 1000).toFixed(1)) : 0;
      const totalTokens = inputTokens + tokenCount;
      const costEst = (inputTokens * 0.000003) + (tokenCount * 0.000015);
      const budgetPct = Math.min(100, Math.round((costEst / 0.10) * 100));
      const metrics: TuiTurnMetrics = {
        inputTokens,
        outputTokens: tokenCount,
        totalTokens,
        tokensPerSec: tps,
        turnCostUsd: costEst,
        costBudgetPercent: budgetPct,
      };

      state = {
        ...state,
        busy: false,
        status: 'done',
        busyStartTime: undefined,
        currentTool: undefined,
        streaming: '',
        tokenCount,
        tokensPerSec: tps,
        lastTurnMetrics: metrics,
        contextTokens: (state.contextTokens || 0) + totalTokens,
        notice: `Completed in ${elapsed}ms (${totalTokens} tokens · ${tps} t/s)`,
        messages: [...state.messages, { role: 'assistant', content: answer, model: state.model, metrics }],
      };
    } catch (error) {
      stopBusyTimer();
      const message = inFlight?.signal.aborted ? 'Cancelled' : error instanceof Error ? error.message : String(error);
      state = { ...state, busy: false, status: 'error', busyStartTime: undefined, currentTool: undefined, streaming: '', notice: message };
    } finally {
      inFlight = undefined;
      stopBusyTimer();
      requestPaint(true);
    }
  };

  // See the note on POLL_INTERVAL_MS: without this a pending approval is
  // invisible until the user happens to press a key.
  const POLL_INTERVAL_MS = 2500;
  let polling = false;
  const pollTimer = setInterval(() => {
    if (polling) return; // a previous tick is still in flight
    polling = true;
    const before = state;
    void refreshExtras(client, state, { light: true })
      .then(fresh => {
        // The keyboard loop may have replaced state while the five requests
        // were in flight. refreshExtras returns a whole state derived from
        // the one it was given, so assigning it now would drop whatever the
        // user typed in the meantime. Skipping costs one interval.
        if (state !== before) return;
        state = fresh;
        requestPaint();
      })
      .catch(() => { /* a failed poll is not worth interrupting the session */ })
      .finally(() => { polling = false; });
  }, POLL_INTERVAL_MS);
  pollTimer.unref?.();

  while (true) {
    flushPaint();
    const key = await terminal.readKey();
    if (!key) break;
    const previous = state.input;
    const next = applyTuiKey(state, key);
    state = { ...next.state, width: terminal.columns, height: terminal.rows };
    if (next.action === 'quit') break;
    if (next.action === 'cancel') {
      stopBusyTimer();
      inFlight?.abort();
      await client.cancel(state.sessionId).catch(() => {});
      state = { ...state, busy: false, status: 'error', busyStartTime: undefined, currentTool: undefined, streaming: '', notice: 'Cancelled' };
    }
    if (next.action === 'new') {
      const session = await client.createSession(state.model);
      state = { ...state, sessionId: session.id, sessionTitle: session.title || 'CLI chat', messages: [], notice: 'New conversation', chatScroll: 0, chatStickToBottom: true };
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
        state = { ...state, pendingApproval: undefined, notice: `Approved run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Approve failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'cancel-run' && next.payload) {
      try {
        await client.runAction(next.payload, 'cancel');
        state = { ...state, pendingApproval: undefined, notice: `Cancelled run ${next.payload}` };
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
        state = { ...state, pendingApproval: undefined, notice: `Continued run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Continue failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (next.action === 'rollback-run' && next.payload) {
      try {
        await client.runAction(next.payload, 'rollback');
        state = { ...state, notice: `Rolled back changes for run ${next.payload}` };
        state = await refreshExtras(client, state);
        if (state.view === 'run-detail' && state.selectedRunDetail?.id === next.payload) {
          state.selectedRunDetail = await client.getRun(next.payload).catch(() => state.selectedRunDetail);
        }
      } catch (err) {
        state = { ...state, notice: `Rollback failed: ${err instanceof Error ? err.message : String(err)}` };
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
        state = { ...state, sessionId: session.id, sessionTitle: session.title || 'CLI chat', messages: [], notice: 'New conversation', chatScroll: 0, chatStickToBottom: true };
      } else if (command.type === 'models') state = { ...state, overlay: 'models', filter: '', selected: 0 };
      else if (command.type === 'workspaces') state = { ...state, overlay: 'workspaces', filter: '', selected: 0 };
      else if (command.type === 'insights') {
        state = { ...state, view: 'insights', selectedInsightIndex: 0 };
        state = await refreshExtras(client, state);
      } else if (command.type === 'stop') {
        stopBusyTimer();
        inFlight?.abort();
        await client.cancel(state.sessionId).catch(() => {});
        state = { ...state, busy: false, status: 'error', busyStartTime: undefined, currentTool: undefined, streaming: '', notice: 'Cancelled' };
      } else if (command.type === 'model') {
        if (!state.models.some(item => item.id === command.id)) state = { ...state, notice: `Unknown model ${command.id}` };
        else state = { ...state, model: command.id, notice: `Next reply uses ${command.id}` };
      } else if (command.type === 'status') {
        try {
          const st = await client.status();
          const provs = st.providers.map(p => `${p.connected ? '✓' : '✗'} ${p.name}`).join('  ');
          // Agent mode runs three of the four providers with their permission
          // check disabled. Without this line the user has no way to tell.
          const unconfined = unconfinedAgentProviders(st.providers.filter(p => p.connected).map(p => p.name));
          const warning = unconfined.length
            ? `\nAgent mode is UNCONFINED for: ${unconfined.join(', ')}. These can write outside the workspace.`
            : '';
          state = {
            ...state,
            notice: `conduit-bridge v${st.version || '0.10.0'}`,
            messages: [...state.messages, { role: 'user', content: '/status' }, { role: 'assistant', content: `conduit-bridge v${st.version || '0.10.0'}\nProviders: ${provs || 'None'}${warning}` }],
          };
        } catch (err) {
          state = { ...state, notice: `Status failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      } else if (command.type === 'run') {
        try {
          const createdRun = await client.createRun(command.prompt, state.model, 'agent', state.activeWorkspaceId);
          state = {
            ...state,
            notice: `Started run ${createdRun.id}`,
            messages: [...state.messages, { role: 'user', content: `/run ${command.prompt}` }, { role: 'assistant', content: `Created run ${createdRun.id}. Press Ctrl+R to inspect runs.` }],
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
              pendingApproval: undefined,
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
            state = { ...state, pendingApproval: undefined, notice: `Approved run ${targetId}` };
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
            state = { ...state, pendingApproval: undefined, notice: `Cancelled run ${targetId}` };
            state = await refreshExtras(client, state);
            if (state.selectedRunDetail?.id === targetId) {
              state.selectedRunDetail = await client.getRun(targetId).catch(() => state.selectedRunDetail);
            }
          } catch (err) {
            state = { ...state, notice: `Cancel failed: ${err instanceof Error ? err.message : String(err)}` };
          }
        }
      } else if (command.type === 'rollback') {
        const targetId = command.runId || state.selectedRunDetail?.id || state.runs[state.runSelectedIndex]?.id;
        if (!targetId) {
          state = { ...state, notice: 'No run selected to roll back' };
        } else {
          try {
            await client.runAction(targetId, 'rollback');
            state = { ...state, notice: `Rolled back changes for run ${targetId}` };
            state = await refreshExtras(client, state);
            if (state.selectedRunDetail?.id === targetId) {
              state.selectedRunDetail = await client.getRun(targetId).catch(() => state.selectedRunDetail);
            }
          } catch (err) {
            state = { ...state, notice: `Rollback failed: ${err instanceof Error ? err.message : String(err)}` };
          }
        }
      } else if (command.type === 'unknown') {
        const known = ['/run', '/continue', '/approve', '/cancel', '/rollback', '/retry', '/workspaces', '/models', '/model', '/sessions', '/insights', '/status', '/help', '/quit', '/new', '/stop'];
        const name = command.text.slice(1).trim().split(/\s+/)[0].toLowerCase();
        const match = known.find(k => k.slice(1).startsWith(name) || name.startsWith(k.slice(1)));
        state = {
          ...state,
          notice: match
            ? `Unknown command ${command.text}. Did you mean ${match}?`
            : `Unknown command ${command.text}. Type /help for all commands.`,
        };
      }
      else if (command.type === 'prompt') void sendPrompt(command.text);
    }
    requestPaint();
  }
  // unref keeps the timer from holding the process open; it does not stop it
  // firing while something else does. The session is over, so it must go.
  clearInterval(pollTimer);
  stopBusyTimer();
  stopResize?.();
  flushPaint();
  screenBuffer.reset();
}

function createStdinTerminal(): TuiTerminal & { close(): void } {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Interactive chat needs a real terminal. Run this from a console, not a pipe.');
  }
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  // 2004 is bracketed paste. With it the terminal wraps pasted text in
  // ESC [ 200 ~ and ESC [ 201 ~, which is the only way to tell a paste from
  // typing. Without it every newline in a paste is indistinguishable from
  // pressing enter, and enter sends.
  output.write('\x1b[?1049h\x1b[?1006h\x1b[?1000h\x1b[?2004h');
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
      if (buffer.startsWith('\x1b[200~')) {
        const end = buffer.indexOf('\x1b[201~');
        // Without the terminator the paste is still arriving. Waiting is
        // required: splitting it here would deliver half a paste and then
        // treat the rest as typing, which is the bug this prevents.
        if (end === -1) break;
        const pasted = buffer.slice(6, end);
        buffer = buffer.slice(end + '\x1b[201~'.length);
        if (pasted) push({ type: 'paste', value: pasted });
        continue;
      }
      if (buffer.startsWith('\x1b[<')) {
        const match = buffer.match(/^\x1b\[<\d+;\d+;\d+[Mm]/);
        if (match) {
          const key = decodeKey(match[0]);
          buffer = buffer.slice(match[0].length);
          if (key) push(key);
          continue;
        }
        if (buffer.length < 16) break;
        buffer = buffer.slice(3);
        continue;
      }
      if (buffer.startsWith('\x1b[')) {
        const match = buffer.match(/^\x1b\[[0-9;]*[a-zA-Z~]/);
        if (match) {
          const key = decodeKey(match[0]);
          buffer = buffer.slice(match[0].length);
          if (key) push(key);
          continue;
        }
        if (buffer.length < 8) break;
        buffer = buffer.slice(2);
        continue;
      }
      if (buffer.startsWith('\x1bO')) {
        if (buffer.length < 3) break;
        const key = decodeKey(buffer.slice(0, 3));
        buffer = buffer.slice(3);
        if (key) push(key);
        continue;
      }
      if (buffer.startsWith('\x1b')) {
        if (buffer.length >= 2) {
          const key = decodeKey(buffer.slice(0, 2));
          if (key) {
            buffer = buffer.slice(2);
            push(key);
            continue;
          }
        }
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
      // Consume a whole code point, not a code unit. An emoji arrives as a
      // surrogate pair, and taking one half of it would hand decodeKey a lone
      // surrogate that no branch can accept, so both halves were dropped.
      const point = String.fromCodePoint(buffer.codePointAt(0) as number);
      const key = decodeKey(point);
      buffer = buffer.slice(point.length);
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
    onResize(handler) {
      output.on('resize', handler);
      return () => { output.off('resize', handler); };
    },
    close() {
      input.off('data', onData);
      if (timer.id) clearTimeout(timer.id);
      waiting?.(null);
      try { input.setRawMode(false); } catch { /* already closed */ }
      output.write('\x1b[?2004l\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l');
    },
  };
}

export async function runChatCommand(cfg: BridgeConfig, flags: { model?: string; cliPath?: string; allowUnconfined?: boolean } = {}): Promise<void> {
  assertSupportedPlatform();
  const logFile = join(process.env.CONDUIT_HOME || join(process.cwd(), '.conduit'), 'logs', 'bridge.log');
  logger.setFileDestination(logFile, true);
  logger.muteConsole(true);

  const baseUrl = `http://${cfg.host}:${cfg.port}`;
  const headers = bearerAuthorization(cfg.authToken);
  await ensureBridgeListener({
    ready: () => probeHealth(baseUrl, headers),
    spawn: () => {
      logger.info(`No listener on ${cfg.host}:${cfg.port}; starting a detached daemon`);
      spawnBridgeDaemon(cfg, flags.cliPath || cliEntryPath(), logFile);
    },
  });
  const terminal = createStdinTerminal();
  // Installed before the first frame, removed in the finally below.
  const stopGuarding = guardTerminalRestore(() => terminal.close());

  try {
    await runInteractiveChat({
      client: createHttpChatClient(baseUrl, headers, { allowUnconfined: flags.allowUnconfined ?? cfg.allowUnconfined }),
      model: flags.model,
      terminal,
    });
  } finally {
    stopGuarding();
    terminal.close();
  }
}

/**
 * Restore the terminal on the paths `finally` cannot reach.
 *
 * The existing `finally` already covers a throw inside runInteractiveChat. What
 * it does not cover is everything that never returns through that await:
 * SIGINT and SIGTERM kill the process outright, and a throw inside a timer
 * callback is an uncaught exception, not a rejected promise. The busy spinner
 * paints from a setInterval (startBusyTimer), so the render path genuinely has
 * a route out of the process that leaves the alternate screen active, mouse
 * tracking on and the cursor hidden. The user is then left with a shell that
 * echoes nothing and needs `reset` to recover.
 *
 * Restoration must be idempotent: a signal can arrive while the normal
 * teardown is already running.
 */
export function guardTerminalRestore(restore: () => void): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    try { restore(); } catch { /* the terminal is already gone */ }
  };

  const onSignal = (signal: NodeJS.Signals) => () => {
    once();
    // Re-raise with the default handler so the exit code stays truthful.
    process.removeListener(signal, handlers[signal]);
    process.kill(process.pid, signal);
  };
  const onFatal = (err: unknown) => {
    once();
    // Print AFTER restoring, or the message lands in the alternate screen and
    // disappears with it, which is how a crash becomes a silent hang.
    process.stderr.write(`\nconduit chat ended unexpectedly: ${String(err)}\n`);
    process.exitCode = 1;
  };

  const handlers: Record<string, () => void> = {
    SIGINT: onSignal('SIGINT'),
    SIGTERM: onSignal('SIGTERM'),
    SIGHUP: onSignal('SIGHUP'),
  };
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
  process.on('uncaughtException', onFatal);
  process.on('unhandledRejection', onFatal);
  process.on('exit', once);

  return () => {
    for (const [signal, handler] of Object.entries(handlers)) process.off(signal, handler);
    process.off('uncaughtException', onFatal);
    process.off('unhandledRejection', onFatal);
    process.off('exit', once);
  };
}
