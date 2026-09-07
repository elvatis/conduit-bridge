import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, linkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../../src/providers/llama-server.js', async original => ({ ...await original<typeof import('../../src/providers/llama-server.js')>(), runLocalTool: vi.fn(), tgrepRpc: vi.fn() }));
import { CodeSearch } from '../../src/skills/code-search.js';
import { runLocalTool, tgrepRpc } from '../../src/providers/llama-server.js';
import { skillContext } from './addendum-context.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-code-search-')); vi.stubEnv('CONDUIT_HOME', join(root, 'runtime')); vi.stubEnv('TGREP_URL', 'tcp://127.0.0.1:7700'); vi.stubEnv('TGREP_INDEX_PATH', ''); vi.mocked(runLocalTool).mockReset(); vi.mocked(tgrepRpc).mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
it('canonicalizes root aliases and verifies indexed snippets, refusing traversal, credential files and hard links', async () => {
  const workspace = join(root, 'workspace', 'project');
  mkdirSync(workspace, { recursive: true }); writeFileSync(join(workspace, 'code.ts'), 'const answer = 42;\n'); writeFileSync(join(workspace, '.env'), 'secret'); writeFileSync(join(root, 'workspace', 'outside.txt'), 'secret'); linkSync(join(root, 'workspace', 'outside.txt'), join(workspace, 'linked.ts'));
  vi.mocked(tgrepRpc).mockResolvedValue({ matches: [
    { type: 'match', file: 'code.ts', line: 1, columns: [7], content: 'untrusted cache text' },
    ...['../outside.txt', '.env', 'linked.ts'].map(file => ({ type: 'match', file, line: 1, columns: [1], content: 'secret' })),
  ] });
  symlinkSync(join(root, 'workspace'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const search = new CodeSearch(skillContext(join(root, 'alias', 'project')));
  expect(await search.search('answer')).toEqual([{ file: 'code.ts', line: 1, column: 7, snippet: 'const answer = 42;' }]); expect(runLocalTool).not.toHaveBeenCalled();
  expect(await search.search('answer', { cwd: workspace })).toEqual([{ file: 'code.ts', line: 1, column: 7, snippet: 'const answer = 42;' }]);
});
it('falls back through tgrep CLI to rg without a shell and handles no matches', async () => {
  writeFileSync(join(root, 'code.ts'), 'const answer = 42;'); vi.mocked(tgrepRpc).mockRejectedValue(new Error('unreachable'));
  vi.mocked(runLocalTool).mockRejectedValueOnce(new Error('missing tgrep')).mockResolvedValueOnce({ exitCode: 0, stdout: JSON.stringify({ type: 'match', data: { path: { text: 'code.ts' }, line_number: 1, submatches: [{ start: 6 }] } }) + '\n' });
  expect(await new CodeSearch(skillContext(root)).search('answer')).toHaveLength(1); expect(vi.mocked(runLocalTool).mock.calls[1][0]).toBe('rg'); expect(vi.mocked(runLocalTool).mock.calls[1][1]).toContain('--no-config');
  vi.mocked(runLocalTool).mockResolvedValue({ exitCode: 1, stdout: '' }); expect(await new CodeSearch(skillContext(root)).search('missing')).toEqual([]);
});
it('checks workspace authorization before indexing and rejects outside roots and non-loopback endpoints', async () => {
  const context = skillContext(root); context.authorize = () => { throw new Error('denied'); };
  await expect(new CodeSearch(context).index('.')).rejects.toThrow('denied'); expect(runLocalTool).not.toHaveBeenCalled();
  context.authorize = vi.fn(); await expect(new CodeSearch(context).search('pattern', { cwd: '..' })).rejects.toThrow('outside');
  vi.stubEnv('TGREP_URL', 'http://example.com:7700'); await expect(new CodeSearch(context).search('pattern')).rejects.toThrow('loopback');
});
it('uses the actual upstream force-index command and reloads only the configured daemon', async () => {
  vi.stubEnv('TGREP_URL', '');
  vi.mocked(runLocalTool).mockResolvedValue({ exitCode: 0, stdout: '' }); vi.mocked(tgrepRpc).mockResolvedValue({ status: 'reloaded' });
  await new CodeSearch(skillContext(root)).reindex('.'); expect(vi.mocked(runLocalTool).mock.calls[0][1]).toContain('--force'); expect(vi.mocked(runLocalTool).mock.calls[0][1][0]).toBe('index');
  vi.stubEnv('TGREP_URL', 'tcp://127.0.0.1:7700'); vi.stubEnv('TGREP_INDEX_PATH', root);
  await new CodeSearch(skillContext(root)).reindex('.'); expect(runLocalTool).toHaveBeenCalledTimes(1);
  expect(tgrepRpc).toHaveBeenCalledWith(7700, 'reload', {}, expect.any(AbortSignal));
});
