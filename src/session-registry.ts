import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runtimeDir } from './config.js';
import { RuntimeJsonFile } from './runtime-json.js';
import type { ChatMessage, ChatRequest, CliProviderName } from './types.js';
import { SkillError } from './skills/index.js';

/** Persisted native session metadata contains hashes, never prompt or answer text. */
export interface CliSessionEntry { key: string; sessionId?: string; provider: CliProviderName; createdAt: number; lastUsedAt: number; requestCount: number; historyHash?: string; historyLength: number; lease?: string; busyUntil?: number }
/** Exclusive in-flight turn and its incremental message suffix. */
export interface CliSessionLease { key: string; token: string; sessionId?: string; newSessionId: string; messages: ChatMessage[] }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const VALID_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/;

/** Scoped CLI continuity with two-hour idle expiry and a 50-successful-request ceiling. */
export class SessionRegistry {
  private readonly file: RuntimeJsonFile<CliSessionEntry[]>;
  constructor(directory = runtimeDir(), private readonly now = Date.now) { this.file = new RuntimeJsonFile(join(directory, 'cli-sessions.json'), () => []); }
  /** Start a lease only when the host supplies a scoped retention key. Changed transcript prefixes start fresh sessions. */
  begin(provider: CliProviderName, req: ChatRequest, executable: string): CliSessionLease {
    if (!req.cliSessionKey || req.cliSessionKey.length > 4096) throw new SkillError('Host-scoped CLI session key required');
    const key = hash([req.cliSessionKey, provider, req.model, req.cwd ?? '', req.mode ?? 'chat', req.disallowedTools ?? '', executable]);
    return this.file.update(entries => {
      const now = this.now();
      for (let i = entries.length - 1; i >= 0; i--) if (now - entries[i].lastUsedAt >= 7200000 && (entries[i].busyUntil ?? 0) <= now) entries.splice(i, 1);
      let entry = entries.find(item => item.key === key);
      if (entry && (entry.busyUntil ?? 0) > now) throw new SkillError('CLI session already has an active request', 409);
      const resume = entry && entry.requestCount < 50 && entry.sessionId && VALID_ID.test(entry.sessionId) && entry.historyLength < req.messages.length && entry.historyHash === hash(req.messages.slice(0, entry.historyLength));
      if (!resume) {
        if (entry) entries.splice(entries.indexOf(entry), 1);
        if (entries.length >= 1000) throw new SkillError('CLI session capacity reached', 429);
        entry = { key, provider, createdAt: now, lastUsedAt: now, requestCount: 0, historyLength: 0 }; entries.push(entry);
      }
      const active = entry!;
      const token = randomUUID(); active.lease = token; active.busyUntil = now + 360000;
      return { key, token, sessionId: resume ? active.sessionId : undefined, newSessionId: randomUUID(), messages: resume ? req.messages.slice(active.historyLength) : req.messages };
    });
  }
  /** Commit only the owned turn; absent or malformed provider session IDs disable resume for the next call. */
  complete(lease: CliSessionLease, messages: ChatMessage[], output: string, sessionId?: string): void {
    this.file.update(entries => {
      const entry = entries.find(item => item.key === lease.key && item.lease === lease.token);
      if (!entry) throw new SkillError('CLI session lease changed', 409);
      entry.sessionId = sessionId && VALID_ID.test(sessionId) ? sessionId : undefined;
      entry.requestCount++; entry.lastUsedAt = this.now();
      const history = [...messages, { role: 'assistant', content: output }];
      entry.historyHash = hash(history); entry.historyLength = history.length;
      delete entry.lease; delete entry.busyUntil;
    });
  }
  /** Invalidate only the owned failed turn; never retry a possibly side-effecting CLI operation automatically. */
  invalidate(lease: CliSessionLease): void { this.file.update(entries => { const index = entries.findIndex(item => item.key === lease.key && item.lease === lease.token); if (index >= 0) entries.splice(index, 1); }); }
}

/** Normalize the documented CLI JSON/JSONL final text and explicit session identifiers. */
export function parseCliSessionOutput(provider: CliProviderName, stdout: string): { text: string; sessionId?: string } {
  let frames: any[];
  try { const parsed = JSON.parse(stdout); frames = Array.isArray(parsed) ? parsed : [parsed]; }
  catch { frames = stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); }
  let text = ''; let sessionId: string | undefined;
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') continue;
    const id = frame.session_id ?? frame.sessionId ?? frame.conversation_id ?? frame.conversationId ?? (frame.type === 'thread.started' ? frame.thread_id : undefined);
    if (typeof id === 'string' && VALID_ID.test(id)) sessionId = id;
    if (provider === 'cli-claude' && frame.type === 'result' && !frame.is_error && typeof frame.result === 'string') text = frame.result;
    if (provider === 'cli-codex' && frame.type === 'item.completed' && frame.item?.type === 'agent_message' && typeof frame.item.text === 'string') text = frame.item.text;
    if (provider === 'cli-gemini') {
      if (typeof frame.response === 'string') text = frame.response;
      if (frame.event === 'result' && frame.result?.status === 'SUCCESS' && typeof frame.result.response === 'string') text = frame.result.response;
    }
  }
  return { text, sessionId };
}

/** Wrap retained chat turns. Stateless and agent requests keep their existing transport unchanged. */
export async function withCliSession(req: ChatRequest, provider: CliProviderName, executable: string, run: (lease?: CliSessionLease) => Promise<{ text: string; sessionId?: string }>): Promise<string> {
  if (!req.cliSessionKey || (req.mode && req.mode !== 'chat')) return (await run()).text;
  const registry = new SessionRegistry();
  const lease = registry.begin(provider, req, executable);
  try {
    const result = await run(lease);
    req.signal?.throwIfAborted();
    registry.complete(lease, req.messages, result.text, result.sessionId ?? lease.sessionId);
    return result.text;
  } catch (error) { registry.invalidate(lease); throw error; }
}
