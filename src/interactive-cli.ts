import { stdin as input, stdout as output } from 'node:process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { BridgeServer } from './server.js';
import { bearerAuthorization } from './config.js';
import type { BridgeConfig } from './types.js';
import { logger } from './logger.js';
import { assertSupportedPlatform } from './platform.js';
import {
  applyTuiKey,
  decodeKey,
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
  runAction(id: string, action: 'approve' | 'cancel' | 'retry' | 'continue', feedback?: string): Promise<void>;
  createRun(prompt: string, model?: string, mode?: 'chat' | 'plan' | 'agent', workspaceId?: string): Promise<{ id: string }>;
  listWorkspaces(): Promise<TuiWorkspaceRow[]>;
  gitSnapshot(workspaceId?: string): Promise<{ detected: boolean; branch: string; files: number; name: string }>;
  listInsights?(): Promise<TuiInsightRow[]>;
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
  if (name === 'insights') return { type: 'insights' };
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

export async function requestOnce(url: URL, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; text: string }> {
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = transport(url, { method: options.method ?? 'GET', headers: options.headers }, (res: IncomingMessage) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, text }); });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function requestJson<T>(url: URL, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  const headers = { ...options.headers, ...(payload ? { 'content-type': 'application/json' } : {}) };
  const res = await requestOnce(url, { method: options.method, headers, body: payload });
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  return JSON.parse(res.text) as T;
}

export function createHttpChatClient(baseUrl: string, headers: Record<string, string> = {}): ChatTurnClient {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    async listModels() {
      const payload = await requestJson<{ data?: Array<{ id: string; display_name?: string }> }>(new URL(`${root}/v1/models`), { headers });
      return (payload.data ?? []).map(item => ({ id: item.id, displayName: item.display_name }));
    },
    async createSession(model) {
      const payload = await requestJson<{ id: string; model: string; title?: string }>(new URL(`${root}/v1/platform/sessions`), {
        method: 'POST', headers, body: { model, title: 'CLI chat' },
      });
      return { id: payload.id, model: payload.model, title: payload.title };
    },
    async listSessions() {
      const payload = await requestJson<{ data?: Array<{ id: string; title?: string; model?: string; updatedAt?: number }> }>(new URL(`${root}/v1/platform/sessions`), { headers });
      return (payload.data ?? []).map(item => ({ id: item.id, title: item.title || item.id, model: item.model, updatedAt: item.updatedAt ?? 0 }));
    },
    async getSession(id) {
      const payload = await requestJson<{ id: string; title?: string; model?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string; model?: string }> }>(
        new URL(`${root}/v1/platform/sessions/${encodeURIComponent(id)}`), { headers },
      );
      return {
        id: payload.id,
        title: payload.title || payload.id,
        model: payload.model || 'default',
        messages: (payload.messages ?? []).map(m => ({ role: m.role, content: m.content, model: m.model })),
      };
    },
    async listRuns() {
      try {
        const payload = await requestJson<{ data?: Array<{ id: string; status: string; model?: string; input?: { prompt?: string }; steps?: unknown[]; costUsd?: number; tokensConsumed?: number; error?: string }> }>(
          new URL(`${root}/v1/platform/runs`), { headers },
        );
        return (payload.data ?? []).map(r => ({
          id: r.id,
          status: r.status,
          model: r.model,
          prompt: r.input?.prompt || '(no prompt)',
          stepsCount: r.steps?.length || 0,
          costUsd: r.costUsd || 0,
          tokensConsumed: r.tokensConsumed || 0,
          error: r.error,
        }));
      } catch {
        return [];
      }
    },
    async getRun(id: string): Promise<TuiRunDetail> {
      const payload = await requestJson<any>(new URL(`${root}/v1/platform/runs/${encodeURIComponent(id)}`), { headers });
      return {
        id: payload.id,
        status: payload.status,
        model: payload.model || 'default',
        prompt: payload.input?.prompt || '',
        createdAt: payload.createdAt || Date.now(),
        costUsd: payload.costUsd || 0,
        tokensConsumed: payload.tokensConsumed || 0,
        error: payload.error,
        steps: payload.steps || [],
        artifacts: payload.artifacts || [],
      };
    },
    async runAction(id: string, action: 'approve' | 'cancel' | 'retry' | 'continue', feedback?: string): Promise<void> {
      await requestJson(new URL(`${root}/v1/platform/runs/${encodeURIComponent(id)}/${action}`), {
        method: 'POST', headers, body: feedback ? { feedback } : {},
      });
    },
    async createRun(prompt: string, model?: string, mode: 'chat' | 'plan' | 'agent' = 'agent', workspaceId?: string): Promise<{ id: string }> {
      return requestJson<{ id: string }>(new URL(`${root}/v1/platform/runs`), {
        method: 'POST',
        headers,
        body: { prompt, model, mode, workspaceId },
      });
    },
    async listWorkspaces() {
      try {
        const payload = await requestJson<{ data?: Array<{ id: string; name: string; path: string; isDefault?: boolean }> }>(
          new URL(`${root}/v1/platform/workspaces`), { headers },
        );
        return payload.data || [];
      } catch {
        return [{ id: 'default', name: 'default', path: process.cwd(), isDefault: true }];
      }
    },
    async gitSnapshot(workspaceId?: string) {
      try {
        const url = new URL(`${root}/v1/git/status`);
        if (workspaceId) url.searchParams.set('workspaceId', workspaceId);
        const payload = await requestJson<{ branch?: string; changedFiles?: number; repository?: string }>(url, { headers });
        return {
          detected: Boolean(payload.branch),
          branch: payload.branch || 'main',
          files: payload.changedFiles || 0,
          name: payload.repository || 'workspace',
        };
      } catch {
        return { detected: false, branch: '', files: 0, name: '' };
      }
    },
    async listInsights() {
      try {
        const payload = await requestJson<{ report?: { items?: Array<{ id: string; kind: string; text: string; title?: string; score?: number }> } }>(
          new URL(`${root}/v1/platform/insights`), { headers },
        );
        return payload.report?.items || [];
      } catch {
        return [];
      }
    },
    async status() {
      try {
        const payload = await requestJson<{ version?: string; providers?: Array<{ name: string; connected: boolean }> }>(new URL(`${root}/v1/status`), { headers });
        return { version: payload.version, providers: payload.providers ?? [] };
      } catch {
        return { providers: [] };
      }
    },
    async send(sessionId, content, model, signal, onDelta) {
      const url = new URL(`${root}/v1/platform/sessions/${encodeURIComponent(sessionId)}/messages`);
      const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
      return new Promise((resolve, reject) => {
        const req = transport(url, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json', accept: 'text/event-stream' },
        }, (res: IncomingMessage) => {
          if ((res.statusCode ?? 0) >= 400) {
            let errorText = '';
            res.on('data', c => { errorText += c; });
            res.on('end', () => { reject(new Error(`HTTP ${res.statusCode}: ${errorText.slice(0, 200)}`)); });
            return;
          }
          let text = '';
          let buffered = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            buffered += chunk;
            const { deltas, done, rest } = parseSseChunk(buffered);
            buffered = rest;
            for (const delta of deltas) { text += delta; onDelta?.(delta); }
            if (done?.assistantMessage?.content) text = done.assistantMessage.content;
          });
          res.on('end', () => { resolve(text); });
        });
        req.on('error', reject);
        if (signal) {
          signal.addEventListener('abort', () => {
            req.destroy();
            reject(new Error('Turn cancelled'));
          }, { once: true });
        }
        req.write(JSON.stringify({ content, model }));
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

async function refreshExtras(client: ChatTurnClient, state: TuiState): Promise<TuiState> {
  const startProbe = Date.now();
  const [sessions, runs, workspaces, git, insights] = await Promise.all([
    client.listSessions ? client.listSessions().catch(() => state.sessions) : Promise.resolve(state.sessions),
    client.listRuns ? client.listRuns().catch(() => state.runs) : Promise.resolve(state.runs),
    client.listWorkspaces ? client.listWorkspaces().catch(() => state.workspaces) : Promise.resolve(state.workspaces),
    client.gitSnapshot ? client.gitSnapshot(state.activeWorkspaceId).catch(() => state.git) : Promise.resolve(state.git),
    client.listInsights ? client.listInsights().catch(() => state.insights || []) : Promise.resolve(state.insights || []),
  ]);
  const latencyMs = Math.max(8, Math.min(250, Date.now() - startProbe));
  const activeWorkspaceId = state.activeWorkspaceId || workspaces?.find(w => w.isDefault)?.id || workspaces?.[0]?.id;
  return {
    ...state,
    sessions: sessions || state.sessions,
    runs: runs || state.runs,
    workspaces: workspaces || state.workspaces,
    git: git || state.git,
    insights: (insights && insights.length ? insights : state.insights) || [],
    latencyMs,
    activeWorkspaceId,
  };
}

export async function runInteractiveChat(options: { client: ChatTurnClient; model?: string; terminal: TuiTerminal }): Promise<void> {
  const { client, terminal } = options;
  const models = await client.listModels();
  if (!models.length) throw new Error('No models are advertised. Connect a provider, then try again.');
  let model = options.model && models.some(item => item.id === options.model) ? options.model : preferredChatModel(models);
  if (!model) throw new Error('No models are advertised. Connect a provider, then try again.');
  const created = await client.createSession(model);
  let inFlight: AbortController | undefined;
  let busyTimer: NodeJS.Timeout | undefined;

  let state: TuiState = {
    view: 'chat', overlay: 'none', model, sessionId: created.id, sessionTitle: created.title || 'CLI chat',
    messages: [], input: '', cursor: 0, filter: '', selected: 0, models, sessions: [], runs: [],
    workspaces: [], runSelectedIndex: 0,
    git: { detected: false, branch: '', files: 0, name: '' }, host: '', notice: 'Ready', busy: false, streaming: '',
    status: 'idle',
    tokenCount: 0,
    tokensPerSec: 0,
    latencyMs: 22,
    width: terminal.columns, height: terminal.rows,
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
    };
    requestPaint(true);
    startBusyTimer();

    try {
      const answer = await client.send(state.sessionId, text, state.model, inFlight.signal, delta => {
        const chunkTokens = Math.max(1, Math.round(delta.length / 4));
        tokenCount += chunkTokens;
        const elapsed = Math.max(1, Date.now() - startTime);
        const tps = parseFloat(((tokenCount / elapsed) * 1000).toFixed(1));

        let currentTool = state.currentTool;
        let status: TuiInferenceStatus = 'streaming';
        if (delta.includes('TOOL:') || delta.includes('Executing tool:')) {
          status = 'tool_execution';
          const match = delta.match(/(?:TOOL:|Executing tool:)\s*([a-zA-Z0-9_-]+)/);
          if (match) currentTool = { name: match[1], status: 'running' };
        } else if (delta.includes('<<<DIFF') || delta.includes('--- a/') || delta.includes('+++ b/')) {
          status = 'diff_apply';
        }

        state = {
          ...state,
          status,
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
      });
      stopBusyTimer();
      const elapsed = Date.now() - startTime;
      const tps = tokenCount > 0 && elapsed > 0 ? parseFloat(((tokenCount / elapsed) * 1000).toFixed(1)) : 0;
      state = {
        ...state,
        busy: false,
        status: 'done',
        busyStartTime: undefined,
        currentTool: undefined,
        streaming: '',
        tokenCount,
        tokensPerSec: tps,
        notice: `Completed in ${elapsed}ms (${tokenCount} tokens · ${tps} t/s)`,
        messages: [...state.messages, { role: 'assistant', content: answer, model: state.model }],
      };
    } catch (error) {
      stopBusyTimer();
      const message = inFlight.signal.aborted ? 'Cancelled' : error instanceof Error ? error.message : String(error);
      state = { ...state, busy: false, status: 'error', busyStartTime: undefined, currentTool: undefined, streaming: '', notice: message };
    } finally {
      inFlight = undefined;
      stopBusyTimer();
      requestPaint(true);
    }
  };

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
        state = { ...state, notice: `Approve failed: ${err instanceof Error ? err.message : String(err)}` };
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
    requestPaint();
  }
  stopBusyTimer();
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
  const logDir = join(process.cwd(), '.conduit', 'logs');
  logger.setFileDestination(join(logDir, 'bridge.log'), true);
  logger.muteConsole(true);

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
