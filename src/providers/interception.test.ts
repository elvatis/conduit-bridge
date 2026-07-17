import { describe, it, expect } from 'vitest';
import {
  parseChatGPTStream,
  parseClaudeStream,
  parseGrokStream,
  parseGeminiStream,
  streamMerged,
  CHATGPT_INTERCEPT,
  CLAUDE_INTERCEPT,
  GROK_INTERCEPT,
  GEMINI_INTERCEPT,
  type NetworkCapture,
  type InPageState,
} from './interception.js';

// A mutable stand-in for NetworkCapture: streamMerged only reads .text / .done.
function fakeCapture(): { text: string; done: boolean } {
  return { text: '', done: false };
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

describe('parseChatGPTStream', () => {
  it('reads cumulative message.content.parts SSE', () => {
    const body = [
      'data: ' + JSON.stringify({ message: { content: { parts: ['Hello'] } } }),
      'data: ' + JSON.stringify({ message: { content: { parts: ['Hello, world'] } } }),
      'data: [DONE]',
    ].join('\n');
    expect(parseChatGPTStream(body)).toBe('Hello, world');
  });

  it('reads OpenAI-compatible delta chunks', () => {
    const body = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'foo ' } }] }),
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'bar' } }] }),
      'data: [DONE]',
    ].join('\n');
    expect(parseChatGPTStream(body)).toBe('foo bar');
  });

  it('returns empty for an unrelated body', () => {
    expect(parseChatGPTStream('data: {"noise":1}\n')).toBe('');
  });
});

describe('parseClaudeStream', () => {
  it('accumulates content_block_delta text_delta events', () => {
    const body = [
      'data: ' + JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10 } } }),
      'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'The ' } }),
      'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } }),
      'data: ' + JSON.stringify({ type: 'content_block_stop' }),
    ].join('\n');
    expect(parseClaudeStream(body)).toBe('The answer');
  });
});

describe('parseGrokStream', () => {
  it('accumulates token-style JSONL', () => {
    const body = [
      JSON.stringify({ result: { response: { token: 'Gr' } } }),
      JSON.stringify({ result: { response: { token: 'ok!' } } }),
    ].join('\n');
    expect(parseGrokStream(body)).toBe('Grok!');
  });

  it('reads a full-response snapshot field', () => {
    const body = JSON.stringify({ result: { response: 'complete answer' } });
    expect(parseGrokStream(body)).toBe('complete answer');
  });
});

describe('parseGeminiStream', () => {
  it('reads SSE candidate parts', () => {
    const body = 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini says hi' }] } }] });
    expect(parseGeminiStream(body)).toBe('Gemini says hi');
  });

  it('falls back to the longest embedded string for batchexecute arrays', () => {
    const body = '[["wrb.fr",null,"[[\\"c_id\\"],null,[[[\\"This is the assistant reply text\\"]]]]"]]';
    expect(parseGeminiStream(body)).toContain('This is the assistant reply text');
  });
});

describe('intercept specs match their endpoints', () => {
  it('chatgpt matches the backend conversation SSE', () => {
    expect(CHATGPT_INTERCEPT.match('https://chatgpt.com/backend-api/conversation')).toBe(true);
    expect(CHATGPT_INTERCEPT.match('https://chatgpt.com/backend-api/me')).toBe(false);
  });
  it('claude matches the completion endpoint', () => {
    expect(CLAUDE_INTERCEPT.match('https://claude.ai/api/organizations/x/chat_conversations/y/completion')).toBe(true);
  });
  it('grok matches the app-chat responses endpoint', () => {
    expect(GROK_INTERCEPT.match('https://grok.com/rest/app-chat/conversations/123/responses')).toBe(true);
  });
  it('gemini matches StreamGenerate / batchexecute', () => {
    expect(GEMINI_INTERCEPT.match('https://gemini.google.com/_/BardChatUi/data/batchexecute')).toBe(true);
  });
});

describe('streamMerged', () => {
  it('streams incremental in-page deltas and stops on done', async () => {
    const capture = fakeCapture();
    const steps: InPageState[] = [
      { text: 'Hel', done: false },
      { text: 'Hello', done: false },
      { text: 'Hello world', done: true },
    ];
    let i = 0;
    const out = await collect(
      streamMerged({
        provider: 'test',
        capture: capture as unknown as NetworkCapture,
        pollInterval: 2,
        readInPage: async () => steps[Math.min(i++, steps.length - 1)],
      }),
    );
    expect(out).toBe('Hello world');
  });

  it('uses the native capture when the in-page reader stays empty', async () => {
    const capture = fakeCapture();
    setTimeout(() => {
      capture.text = 'native full answer';
      capture.done = true;
    }, 8);
    const out = await collect(
      streamMerged({
        provider: 'test',
        capture: capture as unknown as NetworkCapture,
        pollInterval: 2,
        readInPage: async () => ({ text: '', done: false }),
      }),
    );
    expect(out).toBe('native full answer');
  });

  it('falls back to DOM polling when nothing is captured', async () => {
    const capture = fakeCapture();
    async function* domFallback(): AsyncGenerator<string> {
      yield 'from ';
      yield 'dom';
    }
    const out = await collect(
      streamMerged({
        provider: 'test',
        capture: capture as unknown as NetworkCapture,
        pollInterval: 2,
        timeout: 20,
        readInPage: async () => ({ text: '', done: false }),
        domFallback,
      }),
    );
    expect(out).toBe('from dom');
  });
});
