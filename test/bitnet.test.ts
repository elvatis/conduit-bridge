import { afterEach, expect, it, vi } from 'vitest';
import { BitNetProvider } from '../src/providers/bitnet.js';
import { LmStudioProvider, ThinkTagFilter, stripThinkTags } from '../src/providers/lmstudio.js';
import { estimateCost } from '../src/usage.js';
const config = { port: 0, host: '127.0.0.1', logLevel: 'silent' as const, apiKeys: {} };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('advertises BitNet aliases separately, routes its model prefix and uses its own URL', async () => {
  vi.stubEnv('BITNET_URL', 'http://127.0.0.1:45678/'); vi.stubEnv('LM_STUDIO_URL', 'http://127.0.0.1:1234');
  const provider = new BitNetProvider(config);
  expect(provider.models.map(model => model.id)).toEqual(['bitnet/auto', 'bitnet/2B-4T', 'bitnet/embedding-0.6B', 'bitnet/embedding-270M']);
  expect(provider.ownsModel('bitnet/custom')).toBe(true); expect(provider.ownsModel('lmstudio/auto')).toBe(false);
  const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: '<think>private reasoning</think>answer' } }] })); vi.stubGlobal('fetch', fetch);
  expect(await provider.chat({ model: 'bitnet/auto', messages: [{ role: 'user', content: 'question' }] })).toBe('answer');
  expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:45678/v1/chat/completions'); expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('model');
  expect(estimateCost('bitnet/auto', 1000, 1000)).toBe(0);
});
it('filters reasoning across every possible chunk boundary and drops unclosed reasoning', () => {
  const raw = 'before<think>secret</think>after';
  for (let cut = 1; cut < raw.length; cut++) { const filter = new ThinkTagFilter(); expect(filter.push(raw.slice(0, cut)) + filter.push(raw.slice(cut)) + filter.push('', true)).toBe('beforeafter'); }
  expect(stripThinkTags('visible<think>never finished')).toBe('visible'); expect(stripThinkTags('1 < 2')).toBe('1 < 2');
});
it('filters reasoning in real SSE decoding and propagates cancellation', async () => {
  const encoder = new TextEncoder(); const pieces = ['<thi', 'nk>secret</thi', 'nk>answer'];
  const response = new Response(new ReadableStream({ start(controller) { for (const content of pieces) controller.enqueue(encoder.encode('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n')); controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); } }));
  const fetch = vi.fn(async () => response); vi.stubGlobal('fetch', fetch);
  const controller = new AbortController(); const provider = new LmStudioProvider(config); let output = '';
  for await (const part of provider.chatStream({ model: 'lmstudio/auto', messages: [], signal: controller.signal })) output += part;
  expect(output).toBe('answer'); const signal = fetch.mock.calls[0][1].signal as AbortSignal; controller.abort(); expect(signal.aborted).toBe(true);
});
