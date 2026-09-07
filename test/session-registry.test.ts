import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRegistry, parseCliSessionOutput } from '../src/session-registry.js';
import type { ChatRequest } from '../src/types.js';
let root: string; let now: number;
const id = '11111111-1111-4111-8111-111111111111';
const request = (): ChatRequest => ({ cliSessionKey: 'owner1/conversation1', model: 'cli-codex/model', messages: [{ role: 'user', content: 'private sample prompt' }] });
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-cli-session-')); now = 100000000; });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('resumes only the matching transcript, scope, model, executable and policy after restart', () => {
  const registry = new SessionRegistry(root, () => now); const req = request(); const lease = registry.begin('cli-codex', req, 'codex');
  expect(() => registry.begin('cli-codex', req, 'codex')).toThrow('active');
  registry.complete(lease, req.messages, 'answer', id);
  req.messages.push({ role: 'assistant', content: 'answer' }, { role: 'user', content: 'next' });
  const restarted = new SessionRegistry(root, () => now); const second = restarted.begin('cli-codex', req, 'codex');
  expect(second.sessionId).toBe(id); expect(second.messages).toEqual([{ role: 'user', content: 'next' }]); restarted.invalidate(second);
  for (const altered of [{ ...req, cliSessionKey: 'owner2/conversation1' }, { ...req, model: 'cli-codex/other' }, { ...req, disallowedTools: 'Read' }]) expect(restarted.begin('cli-codex', altered, 'codex').sessionId).toBeUndefined();
  const raw = readFileSync(join(root, 'cli-sessions.json'), 'utf8'); expect(raw).not.toContain('private sample prompt'); expect(raw).not.toContain('owner1');
});
it('rotates at 50 successful turns, after idle expiry, and after a history edit', () => {
  const registry = new SessionRegistry(root, () => now); const req = request();
  for (let i = 0; i < 51; i++) {
    const lease = registry.begin('cli-codex', req, 'codex'); expect(Boolean(lease.sessionId)).toBe(i > 0 && i < 50);
    registry.complete(lease, req.messages, 'answer', id); req.messages.push({ role: 'assistant', content: 'answer' }, { role: 'user', content: 'next' });
  }
  now += 7200000; const expired = registry.begin('cli-codex', req, 'codex'); expect(expired.sessionId).toBeUndefined(); registry.complete(expired, req.messages, 'answer', id);
  req.messages[0].content = 'edited'; req.messages.push({ role: 'assistant', content: 'answer' }, { role: 'user', content: 'next' });
  expect(registry.begin('cli-codex', req, 'codex').sessionId).toBeUndefined();
});
it('reads explicit CLI result IDs and never interprets arbitrary progress text as an answer', () => {
  expect(parseCliSessionOutput('cli-codex', JSON.stringify({ type: 'thread.started', thread_id: id }) + '\n' + JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }))).toEqual({ text: 'done', sessionId: id });
  expect(parseCliSessionOutput('cli-claude', JSON.stringify({ type: 'result', session_id: id, result: 'done' }))).toEqual({ text: 'done', sessionId: id });
  expect(parseCliSessionOutput('cli-gemini', JSON.stringify({ session_id: id, response: 'done' }))).toEqual({ text: 'done', sessionId: id });
  expect(parseCliSessionOutput('cli-codex', 'some progress')).toEqual({ text: '', sessionId: undefined });
});
