// Explicit opt-in: synthetic fixtures only, loopback BitNet, no saved user conversations.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';

if (!process.argv.includes('--run')) throw new Error('Pass --run to call local BitNet with synthetic fixtures.');
const endpoint = new URL(process.env.BITNET_URL || 'http://127.0.0.1:8080');
if (!['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname) || !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Native check requires loopback BitNet.');
const logDirectory = resolve('.ai/logs'); await mkdir(logDirectory, { recursive: true });
const temporary = await mkdtemp(resolve(logDirectory, 'insight-quality-'));
try {
  const entry = `
    import { PlatformInsightsService } from './src/platform-insights.js';
    import { BitNetProvider } from './src/providers/bitnet.js';
    import { MemorySnapshotBackend, TransactionalStateStore } from './src/storage.js';
    import { insightQualityCases, insightQualityScenarios } from './test/fixtures/insight-quality.js';
    export { PlatformInsightsService, BitNetProvider, MemorySnapshotBackend, TransactionalStateStore, insightQualityCases, insightQualityScenarios };
  `;
  const compiled = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
  const file = resolve(temporary, 'check.mjs'); await writeFile(file, compiled.outputFiles[0].contents);
  const { PlatformInsightsService, BitNetProvider, MemorySnapshotBackend, TransactionalStateStore, insightQualityCases, insightQualityScenarios } = await import(pathToFileURL(file).href);
  const provider = new BitNetProvider({ port: 0, host: '127.0.0.1' });
  let correct = 0, calls = 0;
  const samples = [...insightQualityCases, ...insightQualityScenarios];
  for (const sample of samples) {
    const store = new TransactionalStateStore(new MemorySnapshotBackend()); await store.ready();
    const contents = 'messages' in sample ? sample.messages : [sample.text];
    const session = { id: sample.id, title: 'Synthetic quality check', userId: 'quality-check', workspaceId: 'default', retention: 'retained', revision: 1, createdAt: 1, updatedAt: 1,
      messages: contents.map((content, index) => ({ id: sample.id + '-' + index, role: sample.role || 'user', content, provider: 'example', model: 'example', createdAt: index + 1, status: 'complete' })) };
    const service = new PlatformInsightsService(store, { sessions: () => [session], analyze: async (_owner, _version, analysis, signal) => {
      calls++;
      return provider.chat({ model: 'bitnet/auto', mode: 'chat', messages: [{ role: 'user', content: analysis.prompt }], max_tokens: 512, temperature: 0, response_format: { type: 'json_object', schema: analysis.schema }, signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
    } });
    try {
      await service.scan('quality-check', 'v1', sample.id.endsWith('-de') ? 'de' : 'en');
      const items = service.view('quality-check', 'v1').report.items;
      const sourceExact = items.every(item => item.sources.length && item.sources.every(source => session.messages.some(message => message.id === source.messageId && message.content.includes(item.text) && source.quote === item.text)));
      const kinds = [...new Set(items.map(item => item.kind))].sort();
      const pass = sourceExact && ('expected' in sample ? (sample.expected === null ? items.length === 0 : items.length === 1 && items[0].kind === sample.expected && items[0].text === sample.text)
        : JSON.stringify(kinds) === JSON.stringify([...sample.kinds].sort()) && kinds.every(kind => items.filter(item => item.kind === kind).length <= 3)
          && (sample.id !== 'duplicate-provenance' || items.length === 1 && items[0].sources.length === 3));
      correct += Number(pass);
      console.log(JSON.stringify({ case: sample.id, pass, expected: sample.expected ?? sample.kinds ?? null, actual: items.map(item => item.kind), sourceExact }));
    } finally { await service.stop(); await store.close(); }
  }
  console.log(JSON.stringify({ correct, total: samples.length, calls }));
  process.exitCode = correct === samples.length ? 0 : 1;
} finally {
  if (dirname(temporary) !== logDirectory || !basename(temporary).startsWith('insight-quality-')) throw new Error('Unexpected temporary output path');
  await rm(temporary, { recursive: true, force: true });
}
