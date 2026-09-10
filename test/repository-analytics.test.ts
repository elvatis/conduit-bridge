import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createContext, runInContext, Script } from 'node:vm';
import { classifySourceFile, countSourceLines, RepositoryAnalyticsService } from '../src/repository-analytics.js';
import { REPOSITORY_ANALYTICS_HTML, REPOSITORY_ANALYTICS_SCRIPT } from '../src/ui/repository-analytics.js';
import { REPOSITORY_ANALYTICS_COPY } from '../src/ui/repository-analytics-copy.js';

const fixtures: string[] = [];
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'conduit-repo-analytics-')); fixtures.push(path);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: path, windowsHide: true, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Analytics Test'); git('config', 'user.email', 'analytics@example.invalid'); git('config', 'commit.gpgsign', 'false');
  const write = (file: string, content: string | Buffer) => { const target = join(path, file); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); };
  const commit = (date: string) => {
    git('add', '.');
    execFileSync('git', ['-c', 'core.hooksPath=', 'commit', '-m', 'Fixture snapshot'], { cwd: path, windowsHide: true, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    return git('rev-parse', 'HEAD');
  };
  return { path, git, write, commit, repository: { id: 'fixture', name: 'Fixture', path } };
}

describe('repository analytics source counting', () => {
  it('counts physical and nonblank lines correctly across empty, LF, CRLF and trailing newline files', () => {
    expect(countSourceLines(Buffer.from(''))).toEqual({ total: 0, nonblank: 0 });
    expect(countSourceLines(Buffer.from('one\n\n two\n'))).toEqual({ total: 3, nonblank: 2 });
    expect(countSourceLines(Buffer.from('one\r\n \t\r\ntwo'))).toEqual({ total: 3, nonblank: 2 });
    expect(countSourceLines(Buffer.from('\n'))).toEqual({ total: 1, nonblank: 0 });
    expect(countSourceLines(Buffer.from([97, 0, 98]))).toBeNull();
  });

  it('classifies supported code and tests while excluding generated, vendor and fixture data', () => {
    for (const path of ['src/server.ts', 'pkg/main.go', 'styles/app.css', 'src/ui.vue']) expect(classifySourceFile(path)).toBe('production');
    for (const path of ['test/server.ts', 'src/server.test.ts', 'src/foo_spec.rb', 'test_main.py', 'e2e/login.ts']) expect(classifySourceFile(path)).toBe('tests');
    for (const path of ['README.md', 'package-lock.json', 'node_modules/a.ts', 'dist/a.js', 'src/app.generated.ts', 'test/fixtures/a.ts', 'vendor/a.go']) expect(classifySourceFile(path)).toBeNull();
  });
});

describe('repository analytics immutable Git snapshots', () => {
  it('measures committed production and test LOC, both metrics and directories; ignores working tree changes', async () => {
    const f = fixture();
    f.write('src/main.ts', 'const a = 1;\n\nexport { a };\n'); f.write('test/main.test.ts', 'first test\n'); f.write('README.md', 'excluded\n');
    const first = f.commit('2026-01-01T12:00:00Z');
    f.write('src/main.ts', 'const a = 1;\n\nexport { a };\n// added\n'); f.write('test/main.test.ts', 'first test\n\nsecond test\n'); f.write('src/binary.ts', Buffer.from([0, 1, 2]));
    const last = f.commit('2026-01-03T12:00:00Z');
    f.write('src/main.ts', 'uncommitted content must not be counted\n');
    const before = f.git('status', '--porcelain');
    const service = new RepositoryAnalyticsService(), report = await service.read(f.repository);
    expect(report.status).toBe('ready'); expect(report.branch).toBe('main'); expect(report.branches).toEqual(['main']);
    expect(report.snapshots.map(snapshot => snapshot.sha)).toEqual([first, last]);
    expect(report.snapshots[0].production).toEqual({ total: 3, nonblank: 2, files: 1 });
    expect(report.snapshots[1].production).toEqual({ total: 4, nonblank: 3, files: 1 });
    expect(report.snapshots[1].tests).toEqual({ total: 3, nonblank: 2, files: 1 });
    expect(report.snapshots[1].excludedFiles).toBe(2);
    expect(report.snapshots[1].directories).toEqual([
      { name: 'src', production: { total: 4, nonblank: 3, files: 1 }, tests: { total: 0, nonblank: 0, files: 0 } },
      { name: 'test', production: { total: 0, nonblank: 0, files: 0 }, tests: { total: 3, nonblank: 2, files: 1 } },
    ]);
    expect(report.coverage).toMatchObject({ commits: 2, candidates: 2, historyTruncated: false, sampled: false, historyDays: 2 });
    expect(f.git('status', '--porcelain')).toBe(before); expect(f.git('rev-parse', 'HEAD')).toBe(last);
    expect(report.repository).not.toHaveProperty('path');
  }, 20_000);

  it('reads an exact local branch without switching refs and rejects revision expressions', async () => {
    const f = fixture(); f.write('main.py', 'original\n'); const first = f.commit('2026-01-01T12:00:00Z'); f.git('branch', 'feature/one');
    f.write('main.py', 'original\nadded\n'); const head = f.commit('2026-01-02T12:00:00Z');
    const service = new RepositoryAnalyticsService();
    const branch = await service.read(f.repository, 'feature/one');
    expect(branch.snapshots.at(-1)?.sha).toBe(first); expect(branch.branch).toBe('feature/one');
    expect(f.git('rev-parse', 'HEAD')).toBe(head); expect(f.git('branch', '--show-current')).toBe('main');
    for (const invalid of ['--all', 'HEAD~1', 'main:path', 'main..feature/one', 'missing']) {
      expect(await service.read(f.repository, invalid)).toMatchObject({ status: 'error', error: 'invalid_branch', snapshots: [] });
    }
  }, 20_000);

  it('coalesces concurrent scans, caches reports and keeps branch cache entries separate', async () => {
    const f = fixture(); f.write('index.ts', 'one\n'); f.commit('2026-01-01T12:00:00Z'); f.git('branch', 'feature');
    const service = new RepositoryAnalyticsService();
    const [first, second] = await Promise.all([service.read(f.repository), service.read(f.repository)]);
    expect(first).toBe(second); expect(await service.read(f.repository)).toBe(first);
    const separate = await service.read(f.repository, 'feature'); expect(separate).not.toBe(first); expect(separate.branch).toBe('feature');
  }, 20_000);

  it('reports empty and unavailable repositories without fabricated snapshots or raw filesystem errors', async () => {
    const f = fixture(), service = new RepositoryAnalyticsService();
    expect(await service.read(f.repository)).toMatchObject({ status: 'empty', snapshots: [], coverage: { commits: 0 } });
    const report = await service.read({ ...f.repository, path: join(f.path, 'missing') });
    expect(report).toMatchObject({ status: 'error', error: 'unavailable', snapshots: [] }); expect(JSON.stringify(report)).not.toContain(f.path);
    f.write('nested/main.ts', 'source\n'); f.commit('2026-01-01T12:00:00Z');
    expect(await service.read({ ...f.repository, path: join(f.path, 'nested') })).toMatchObject({ status: 'error', error: 'unavailable', snapshots: [] });
  }, 20_000);

  it('labels history sampling and limits, and exposes skipped source files as incomplete counts', async () => {
    const f = fixture();
    for (let day = 1; day <= 5; day++) { f.write('main.ts', 'line\n'.repeat(day)); f.write('test/main.test.ts', 'test\n'.repeat(day)); f.commit('2026-01-0' + day + 'T12:00:00Z'); }
    const report = await new RepositoryAnalyticsService({ limits: { commits: 4, snapshots: 2 } }).read(f.repository);
    expect(report.coverage).toMatchObject({ commits: 4, candidates: 4, historyTruncated: true, sampled: true, maxCommits: 4, maxSnapshots: 2 });
    expect(report.snapshots).toHaveLength(2); expect(report.snapshots[0].production.nonblank).toBe(2); expect(report.snapshots[1].production.nonblank).toBe(5);
    const partial = await new RepositoryAnalyticsService({ limits: { files: 1, snapshots: 1 } }).read(f.repository);
    expect(partial.status).toBe('partial'); expect(partial.snapshots[0]).toMatchObject({ complete: false, skippedFiles: 1 });
    const oversized = await new RepositoryAnalyticsService({ limits: { blobBytes: 1, snapshots: 1 } }).read(f.repository);
    expect(oversized.status).toBe('partial'); expect(oversized.snapshots[0].skippedFiles).toBe(2);
  }, 20_000);
});

describe('repository analytics browser module', () => {
  it('ships syntactically valid browser code and translated accessible chart and range controls', () => {
    expect(() => new Script(REPOSITORY_ANALYTICS_SCRIPT)).not.toThrow();
    expect(REPOSITORY_ANALYTICS_HTML).toContain('id="ra-range-start"'); expect(REPOSITORY_ANALYTICS_HTML).toContain('id="ra-range-end"');
    for (const match of REPOSITORY_ANALYTICS_HTML.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)) {
      expect(REPOSITORY_ANALYTICS_COPY.en[match[1]], match[1]).toBeTruthy(); expect(REPOSITORY_ANALYTICS_COPY.de[match[1]], match[1]).toBeTruthy();
    }
  });

  it('keeps range presets on recorded dates and suppresses misleading growth from partial scans', () => {
    const nodes = new Map<string, any>();
    const $ = (id: string) => {
      if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', addEventListener() {}, classList: { contains: () => false } });
      return nodes.get(id);
    };
    const context = createContext({ $, document: { querySelectorAll: () => [], documentElement: {} }, currentLang: 'en',
      esc: (value: unknown) => String(value), t: (key: string) => REPOSITORY_ANALYTICS_COPY.en[key] || key,
      MutationObserver: class { observe() {} },
    });
    runInContext(REPOSITORY_ANALYTICS_SCRIPT, context);
    runInContext(`
      raRender = () => {};
      raState.report = { snapshots: [
        { timestamp: Date.UTC(2026,0,1), production:{total:5,nonblank:3,files:1},tests:{total:2,nonblank:2,files:1},complete:true },
        { timestamp: Date.UTC(2026,0,24), production:{total:10,nonblank:7,files:2},tests:{total:4,nonblank:3,files:2},complete:true },
        { timestamp: Date.UTC(2026,0,31), production:{total:20,nonblank:14,files:3},tests:{total:8,nonblank:6,files:3},complete:true }
      ] };
      raPreset(7);
    `, context);
    expect(runInContext('raState.start', context)).toBe(1); expect(runInContext('raState.end', context)).toBe(2);
    runInContext('raPreset("all"); raRenderKpis(raVisible())', context);
    expect($('ra-kpis').innerHTML).toContain('+11 ('); expect($('ra-kpis').innerHTML).toContain('14</strong>');
    runInContext('raState.metric="total";raRenderKpis(raVisible())', context);
    expect($('ra-kpis').innerHTML).toContain('20</strong>'); expect($('ra-kpis').innerHTML).toContain('+15 (');
    runInContext('raState.report.snapshots[2].complete=false;raRenderKpis(raVisible())', context);
    expect($('ra-kpis').innerHTML).toContain('≥ 20'); expect($('ra-kpis').innerHTML).not.toContain('+15 (');
    expect($('ra-kpis').innerHTML).toContain('Incomplete source coverage');
  });

  it('spaces date ticks by their visual position, preserving endpoints and reducing mobile labels', () => {
    const context = createContext({ $: () => null, document: { querySelectorAll: () => [], documentElement: {} }, MutationObserver: class { observe() {} } });
    runInContext(REPOSITORY_ANALYTICS_SCRIPT, context);
    const ticks = (times: number[], width: number) => runInContext(`
      (() => {
        const items = ${JSON.stringify(times)}.map(timestamp => ({timestamp,production:{nonblank:1},tests:{nonblank:1}}));
        const geometry = raChartGeometry(items);
        return raChartTicks(items,geometry,${width}).map(index => ({index,x:geometry.x(items[index])}));
      })()
    `, context) as Array<{ index: number; x: number }>;
    const clustered = [0, 24, 25, 26, 27, 28, 29, 30];
    const desktop = ticks(clustered, 950);
    expect(desktop[0].index).toBe(0); expect(desktop.at(-1)?.index).toBe(clustered.length-1);
    for (let index = 1; index < desktop.length; index++) expect(desktop[index].x-desktop[index-1].x).toBeGreaterThanOrEqual(125);
    expect(ticks(clustered, 360).map(tick => tick.index)).toEqual([0,7]);
    expect(ticks([0,5,10,15,20,25,30], 950)).toHaveLength(4);
    expect(ticks([1,1,1], 950).map(tick => tick.index)).toEqual([0]);
    expect(ticks([1], 360).map(tick => tick.index)).toEqual([0]);
  });
});
