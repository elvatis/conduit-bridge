import { describe, expect, it } from 'vitest';
import { parseSseChunk } from '../src/interactive-cli.js';

/**
 * A contract test between the client parser and the frames its own server
 * writes. The frames below are built the way src/server.ts:2099-2114 builds
 * them, so this file fails if either side changes shape without the other.
 *
 * That divergence is exactly what happened: the parser was written against the
 * platform session endpoint, the send path later moved to /v1/chat/completions,
 * and nothing compared the two. The result was a chat that showed a spinner and
 * then an empty bubble, with every delta-derived counter frozen at zero.
 */

/** Mirrors the chunk src/server.ts writes for each streamed piece of content. */
const serverChunk = (content: string): string =>
  `data: ${JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    model: 'cli-codex/first',
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`;

/** Mirrors the final chunk plus the sentinel that closes the stream. */
const serverTail = (): string =>
  `data: ${JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    model: 'cli-codex/first',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })}\n\ndata: [DONE]\n\n`;

describe('parseSseChunk against the frames this server actually writes', () => {
  it('extracts content from OpenAI-shaped chunks', () => {
    const { deltas } = parseSseChunk(serverChunk('Hallo ') + serverChunk('Welt'));
    expect(deltas).toEqual(['Hallo ', 'Welt']);
  });

  it('terminates on the bare sentinel alone, which is not JSON', () => {
    // Deliberately WITHOUT the finish_reason chunk. Asserting against the full
    // tail would let finish_reason satisfy this case, and disabling the
    // sentinel branch would then stay green - measured, it did.
    const { done } = parseSseChunk('data: [DONE]\n\n');
    expect(done).toBeDefined();
  });

  it('terminates on the full tail, sentinel and finish_reason together', () => {
    expect(parseSseChunk(serverTail()).done).toBeDefined();
  });

  it('terminates on finish_reason even if the sentinel never arrives', () => {
    const cut = serverTail().replace('data: [DONE]\n\n', '');
    expect(parseSseChunk(cut).done).toBeDefined();
  });

  it('keeps an incomplete trailing frame in rest instead of losing it', () => {
    const whole = serverChunk('eins');
    const split = whole + 'data: {"choices":[{"delta":{"content":"zw';
    const first = parseSseChunk(split);
    expect(first.deltas).toEqual(['eins']);
    expect(first.rest).toContain('"zw');
  });

  it('still understands the platform session format', () => {
    // The other endpoint is a live consumer; repairing one must not break it.
    const frame =
      `data: ${JSON.stringify({ type: 'delta', delta: 'aus der Plattform' })}\n\n` +
      `data: ${JSON.stringify({ type: 'done', assistantMessage: { content: 'fertig' } })}\n\n`;
    const { deltas, done } = parseSseChunk(frame);
    expect(deltas).toEqual(['aus der Plattform']);
    expect(done?.assistantMessage?.content).toBe('fertig');
  });

  it('control: an unrelated JSON frame yields no delta', () => {
    // Without this, a parser that pushed every string it found would pass
    // every assertion above while being wrong.
    const frame = `data: ${JSON.stringify({ object: 'something.else', note: 'kein delta' })}\n\n`;
    expect(parseSseChunk(frame).deltas).toEqual([]);
  });

  it('control: an empty delta contributes nothing', () => {
    expect(parseSseChunk(serverChunk('')).deltas).toEqual([]);
  });

  it('extracts structured executionEvent from server SSE frames', () => {
    const frame = `data: ${JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      model: 'cli-codex/gpt-5.6-sol',
      choices: [],
      executionEvent: { kind: 'command', id: 'cmd-1', command: 'git status', status: 'running' },
    })}\n\n`;
    const { events } = parseSseChunk(frame);
    expect(events).toEqual([{ kind: 'command', id: 'cmd-1', command: 'git status', status: 'running' }]);
  });

  it('extracts structured execution_event from platform SSE frames', () => {
    const frame = `data: ${JSON.stringify({
      type: 'execution_event',
      event: { kind: 'message', id: 'msg-1', text: 'analyzing workspace', at: 1720000000000 },
    })}\n\n`;
    const { events } = parseSseChunk(frame);
    expect(events).toEqual([{ kind: 'message', id: 'msg-1', text: 'analyzing workspace', at: 1720000000000 }]);
  });
});
