import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformInsightsService, type InsightAnalysis } from '../src/platform-insights.js';
import type { PlatformSession } from '../src/platform-content.js';
import { MemorySnapshotBackend, TransactionalStateStore } from '../src/storage.js';

const services: PlatformInsightsService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.stop())); });
const response = (selected = [0]) => JSON.stringify({ selected });
const validResponse = (analysis: InsightAnalysis) => response(Array.from({ length: analysis.schema.properties.selected.minItems }, (_, index) => index));
function session(id: string, owner = 'alice', contents = ['Please review this change.', 'The tests passed.']): PlatformSession {
  return { id, userId: owner, title: id, workspaceId: 'default', retention: 'retained', revision: 1, createdAt: 1, updatedAt: 1,
    messages: contents.map((content, index) => ({ id: `${id}-${index}`, role: index % 2 ? 'assistant' : 'user', content, provider: 'test', model: 'test', createdAt: index + 1, status: 'complete' })) };
}
async function fixture(initial = [session('first')]) {
  const backend = new MemorySnapshotBackend(), store = new TransactionalStateStore(backend); await store.ready();
  let sessions = initial, authorized = true;
  const visible = vi.fn((_owner: string, version: string) => { if (!authorized || version !== 'v1') throw new Error('Authorization revoked'); return structuredClone(sessions); });
  const analyze = vi.fn(async (_owner: string, _version: string, analysis: InsightAnalysis, _signal: AbortSignal): Promise<string> => {
    return validResponse(analysis);
  });
  const create = () => { const service = new PlatformInsightsService(store, { sessions: visible, analyze }); services.push(service); return service; };
  const service = create();
  return { service, store, backend, analyze, create, sessions: () => sessions, set: (next: PlatformSession[]) => { sessions = next; }, revoke: () => { authorized = false; } };
}

describe('local session insights', () => {
  it('considers complete messages through their final sentence, preserves Unicode and isolates owners', async () => {
    const long = Array.from({ length: 220 }, (_, index) => `The measured result ${index} retained 😀 and quoted "text".\n`).join('') + 'The final test passed at THE_END_OF_THE_LAST_MESSAGE.';
    const f = await fixture([session('first'), session('long', 'alice', [long]), session('private', 'bob', ['PRIVATE_BOB'])]);
    f.sessions()[0].messages.push({ ...f.sessions()[0].messages[0], id: 'pending', status: 'pending', content: 'UNFINISHED' });
    await f.service.scan('alice', 'v1', 'de');
    const inputs = f.analyze.mock.calls.map(call => call[2].prompt);
    const rows = inputs.flatMap(prompt => JSON.parse(prompt.split('\n').at(-1)!));
    expect(rows.some(row => row.text.includes('THE_END_OF_THE_LAST_MESSAGE'))).toBe(true);
    expect(rows.every(row => !row.text.includes('�'))).toBe(true);
    expect(inputs.every(prompt => prompt.length < 3500)).toBe(true);
    expect(inputs.join('')).not.toContain('PRIVATE_BOB'); expect(inputs.join('')).not.toContain('UNFINISHED');
    const view = f.service.view('alice', 'v1');
    expect(view).toMatchObject({ availableSessions: 2, availableMessages: 3, excludedMessages: 1, stale: false, job: { status: 'complete' }, report: { sessions: 2, messages: 3, language: 'de' } });
    expect(view.report!.items.length).toBeLessThanOrEqual(4);
    expect(view.report!.items.every(item => item.sources.every(source => source.sessionId !== 'private'))).toBe(true);
    expect(view.report!.items.every(item => item.sources.every(source => f.sessions().find(session => session.id === source.sessionId)!.messages.find(message => message.id === source.messageId)!.content.includes(source.quote!)))).toBe(true);
    expect(f.analyze.mock.calls.some(call => call[2].schema.properties.selected.maxItems === 2)).toBe(true);
    const calls = f.analyze.mock.calls.length;
    await f.service.scan('alice', 'v1', 'de'); expect(f.analyze).toHaveBeenCalledTimes(calls);
    expect(f.create().view('alice', 'v1').report).toEqual(view.report);
  });

  it('marks appended history stale but hides output as soon as any input source changes', async () => {
    const f = await fixture(); await f.service.scan('alice', 'v1', 'en');
    f.set([...f.sessions(), session('new')]);
    expect(f.service.view('alice', 'v1')).toMatchObject({ stale: true, report: { messages: 2 } });
    // Even an uncited input belongs to the privacy boundary of the derived output.
    f.sessions()[0].messages[1].content = 'Replaced private evidence';
    expect(f.service.view('alice', 'v1').report).toBeUndefined();
    await f.service.scan('alice', 'v1', 'en'); expect(f.service.view('alice', 'v1').report?.messages).toBe(4);
    f.set(f.sessions().slice(1)); expect(f.service.view('alice', 'v1').report).toBeUndefined();
  });

  it('reloads the report and its verified excerpts from a newly opened store', async () => {
    const f = await fixture(); await f.service.scan('alice', 'v1', 'en');
    const expected = f.service.view('alice', 'v1').report;
    await f.service.stop(); await f.store.close();
    const reopened = new TransactionalStateStore(f.backend); await reopened.ready();
    const service = new PlatformInsightsService(reopened, { sessions: () => f.sessions(), analyze: f.analyze }); services.push(service);
    expect(service.view('alice', 'v1').report).toEqual(expected);
    f.analyze.mockClear(); await service.scan('alice', 'v1', 'en'); expect(f.analyze).not.toHaveBeenCalled(); await reopened.close();
  });

  it('retries invalid selections once and bounds schema IDs to eligible statements', async () => {
    const f = await fixture([session('one', 'alice', ['The tests passed.'])]);
    f.analyze.mockResolvedValueOnce(response([9]));
    await f.service.scan('alice', 'v1', 'en'); expect(f.analyze).toHaveBeenCalledTimes(2);
    expect(f.analyze.mock.calls.every(call => JSON.stringify(call[2].schema.properties.selected.items.enum) === '[0]')).toBe(true);
    expect(f.service.view('alice', 'v1').report!.items[0].sources[0].quote).toBe('The tests passed.');
  });

  it('keeps category, full wording and provenance attached to selected IDs during merging', async () => {
    const f = await fixture([session('all', 'alice', ['Test one passed.', 'Test two passed.', 'Test three passed.', 'Test four passed.'])]);
    f.analyze.mockImplementation(async (_owner, _version, analysis) => {
      const rows = JSON.parse(analysis.prompt.split('\n').at(-1)!);
      return rows.length > 1 ? response([1, 3]) : response();
    });
    await f.service.scan('alice', 'v1', 'en');
    expect(f.service.view('alice', 'v1').report!.items[0]).toMatchObject({ kind: 'finding', text: 'Test two passed.', sources: [{ messageId: 'all-1', quote: 'Test two passed.' }] });
  });

  it('keeps result wording exactly in the source and invalidates older summary formats', async () => {
    const f = await fixture(); await f.service.scan('alice', 'v1', 'de');
    expect(f.service.view('alice', 'v1').report!.items.every(item => item.text === item.sources[0].quote)).toBe(true);
    await f.store.transaction(tx => tx.put('platform.insights', 'alice', { ...tx.read<any>('platform.insights', 'alice'), format: 2, result: [{ kind: 'decision', text: 'Unverified old prose', sources: [] }] }));
    expect(f.service.view('alice', 'v1').report).toBeUndefined(); f.analyze.mockClear();
    await f.service.scan('alice', 'v1', 'de'); expect(f.analyze).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.service.view('alice', 'v1'))).not.toContain('Unverified old prose');
  });

  it('combines identical statements across conversations and retains their distinct sources', async () => {
    const f = await fixture([session('one', 'alice', ['The tests passed.']), session('two', 'alice', ['The tests passed.'])]);
    await f.service.scan('alice', 'v1', 'en'); const items = f.service.view('alice', 'v1').report!.items;
    expect(items).toHaveLength(1); expect(items[0].text).toBe('The tests passed.');
    expect(items[0].sources.map(source => source.sessionId)).toEqual(['one', 'two']);
  });

  it('preserves a rare decision, lesson and request even if the model selects only results', async () => {
    const content = ['The first test passed.', 'The second test passed.', 'The third test passed.', 'The fourth test passed.',
      'We decided to use SQLite.', 'Please add a restore test.', 'Lesson learned: always verify backup restoration.'].join(' ');
    const f = await fixture([session('mixed', 'alice', [content])]);
    await f.service.scan('alice', 'v1', 'en');
    expect(f.service.view('alice', 'v1').report!.items.map(item => item.kind).sort()).toEqual(['action', 'decision', 'finding', 'lesson']);
  });

  it('does not convert a long sentence crossing a batch boundary into a positive suffix', async () => {
    const prefix = 'This is background context without a reported result. '.repeat(32);
    const content = prefix + 'We have not decided ' + 'after extensive discussions '.repeat(7) + 'to use SQLite.\nThe final restore test passed.';
    const f = await fixture([session('boundary', 'alice', [content])]);
    await f.service.scan('alice', 'v1', 'en');
    expect(f.service.view('alice', 'v1').report!.items.map(item => item.text)).toEqual(['The final restore test passed.']);
  });

  it('finishes a test-only history without inference and keeps its coverage visible', async () => {
    const f = await fixture([session('echo', 'alice', ['Reply with exactly SESSION_TEST_5829 and nothing else.', 'SESSION_TEST_5829'])]);
    await f.service.scan('alice', 'v1', 'en'); expect(f.analyze).not.toHaveBeenCalled();
    expect(f.service.view('alice', 'v1')).toMatchObject({ report: { messages: 2, sessions: 1, items: [] }, job: { status: 'complete', completed: 2, total: 2 } });
  });

  it('bounds reduction prompts and terminates for escape-heavy original statements', async () => {
    const contents = Array.from({ length: 7 }, (_, index) => `The restore test ${index} passed with ${'\\\\\\\\'.repeat(90)} retained.`);
    const f = await fixture([session('dense', 'alice', contents)]);
    await f.service.scan('alice', 'v1', 'en');
    expect(f.analyze.mock.calls.every(call => call[2].prompt.length < 3500)).toBe(true);
    expect(f.service.view('alice', 'v1').report!.items.length).toBeLessThanOrEqual(3);
  });

  it('keeps extracted items for retry when the final durable commit fails', async () => {
    const f = await fixture(); const commit = f.backend.commit.bind(f.backend); let fail = true;
    vi.spyOn(f.backend, 'commit').mockImplementation(async (snapshot, revision) => {
      if (fail && (snapshot.collections['platform.insights']?.alice as any)?.status === 'complete') { fail = false; throw new Error('Transient commit failure'); }
      return commit(snapshot, revision);
    });
    await expect(f.service.scan('alice', 'v1', 'en')).rejects.toThrow('Transient commit failure');
    expect(f.store.read<any>('platform.insights', 'alice').items.length).toBeGreaterThan(0);
    f.analyze.mockClear(); await f.service.scan('alice', 'v1', 'en'); expect(f.analyze).not.toHaveBeenCalled();
    expect(f.service.view('alice', 'v1').report!.items).toHaveLength(2);
  });

  it.each([
    response([4]), response([-1]), response([0.5]), response(['0'] as unknown as number[]), response([]), response([0, 0]),
    '{"items":[{"kind":"finding","text":"","sources":[0]}]}',
    '{"items":[{"kind":"finding","text":"An invented conclusion","quote":"Please review this change.","sources":[0]}]}',
    '{"items":[],"extra":"not allowed"}', 'non-JSON provider text',
  ])('rejects invalid structured output and retains no raw provider error', async output => {
    const f = await fixture(); f.analyze.mockResolvedValue(output);
    await expect(f.service.scan('alice', 'v1', 'en')).rejects.toThrow();
    expect(f.service.view('alice', 'v1')).toMatchObject({ job: { status: 'error', errorCode: 'analysis_failed' } });
    expect(f.service.view('alice', 'v1').report).toBeUndefined();
    expect(JSON.stringify(f.store.list('platform.insights'))).not.toContain(output);
  });

  it('checks source access again after inference and does not expose revoked output', async () => {
    const f = await fixture();
    f.analyze.mockImplementation(async () => { f.set([]); return response(); });
    await expect(f.service.scan('alice', 'v1', 'en')).rejects.toThrow('sources changed');
    expect(f.service.view('alice', 'v1').report).toBeUndefined();
    expect(JSON.stringify(f.store.list('platform.insights'))).not.toContain('Previously private content');
    f.revoke(); expect(() => f.service.view('alice', 'v1')).toThrow('Authorization revoked');
  });

  it('cancels an uncooperative inference and resumes only the unfinished batches after restart', async () => {
    const f = await fixture([session('long', 'alice', ['The measured sample 0 passed the retention test.', 'The measured sample 1 passed the retention test.', 'The measured sample 2 passed the retention test.'])]); let calls = 0;
    f.analyze.mockImplementation(async (_owner, _version, analysis) => ++calls === 1 ? validResponse(analysis) : new Promise<string>(() => {}));
    const pending = f.service.scan('alice', 'v1', 'en');
    const stopped = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(f.analyze).toHaveBeenCalledTimes(2));
    await expect(f.service.scan('alice', 'v1', 'en')).rejects.toThrow('already running');
    f.service.cancel('bob'); expect(f.service.busy).toBe(true);
    f.service.cancel('alice'); await stopped;
    const interrupted = f.service.view('alice', 'v1').job;
    expect(interrupted).toMatchObject({ status: 'cancelled', completed: 1 }); expect(interrupted.total).toBeGreaterThan(1);
    const resumed = f.create(); f.analyze.mockImplementation(async (_owner, _version, analysis) => validResponse(analysis)); f.analyze.mockClear();
    await resumed.scan('alice', 'v1', 'en');
    expect(resumed.view('alice', 'v1').job.status).toBe('complete');
    expect(f.analyze.mock.calls[0][2].prompt).not.toContain('The measured sample 0 passed');
  });

  it('reports an interrupted stored job and restarts when the requested language changes', async () => {
    const f = await fixture(); await f.service.scan('alice', 'v1', 'de');
    await f.store.transaction(tx => tx.put('platform.insights', 'alice', { ...tx.read<any>('platform.insights', 'alice'), status: 'running', items: [] }));
    expect(f.create().view('alice', 'v1').job.status).toBe('interrupted');
    await f.service.scan('alice', 'v1', 'en'); expect(f.analyze).toHaveBeenCalledTimes(4);
    expect(f.service.view('alice', 'v1').report?.language).toBe('en');
  });

  it('completes an empty history without model calls and surfaces generic model failures', async () => {
    const f = await fixture([]); await f.service.scan('alice', 'v1', 'de');
    expect(f.analyze).not.toHaveBeenCalled(); expect(f.service.view('alice', 'v1').report?.items).toEqual([]);
    f.set([session('new')]); f.analyze.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'));
    await expect(f.service.scan('alice', 'v1', 'de')).rejects.toThrow();
    expect(JSON.stringify(f.store.list('platform.insights'))).not.toContain('PRIVATE_PROVIDER_ERROR');
  });
});
