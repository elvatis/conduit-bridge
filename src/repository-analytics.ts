import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

/** The caller must resolve this from its authorized repository registry. Never accept a request path. */
export interface AnalyticsRepository { id: string; name: string; path: string }
export interface LineCounts { total: number; nonblank: number; files: number }
export interface RepositorySnapshot {
  sha: string;
  timestamp: number;
  production: LineCounts;
  tests: LineCounts;
  directories: Array<{ name: string; production: LineCounts; tests: LineCounts }>;
  excludedFiles: number;
  skippedFiles: number;
  complete: boolean;
}
export interface RepositoryAnalyticsReport {
  object: 'conduit.repository_analytics';
  repository: { id: string; name: string };
  branch: string;
  branches: string[];
  branchesTruncated: boolean;
  generatedAt: number;
  status: 'ready' | 'partial' | 'empty' | 'error';
  error?: 'unavailable' | 'invalid_branch' | 'scan_limit';
  snapshots: RepositorySnapshot[];
  coverage: {
    source: 'committed-source';
    firstParent: true;
    historyTruncated: boolean;
    sampled: boolean;
    commits: number;
    candidates: number;
    omittedSnapshots: number;
    oldestAt: number | null;
    newestAt: number | null;
    historyDays: number;
    maxCommits: number;
    maxSnapshots: number;
    excluded: string[];
  };
}

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|pyi?|go|rs|java|kt|kts|c|h|cc|cpp|cxx|hpp|cs|fs|fsx|vb|php|rb|swift|m|mm|scala|sc|sh|bash|zsh|ps1|psm1|sql|r|jl|lua|pl|pm|ex|exs|erl|hrl|clj|cljs|cljc|edn|dart|vue|svelte|astro|html?|css|scss|sass|less|sol|zig|nix|tf|hcl|proto|graphql|gql|elm|hs|lhs|ml|mli|pas|f90|f95|f03|f08|f|for|v|sv|vhd|vhdl)$/i;
const EXCLUDED_PATH = /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|\.next|\.nuxt|out|target|__snapshots__|fixtures|__fixtures__)(?:\/|$)|(?:\.min\.[cm]?js|\.generated\.[^/]+|\.g\.cs)$/i;
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|specs?|e2e|cypress|playwright)(?:\/|$)|(?:^|\/)(?:test_[^/]+|[^/]+_(?:test|spec)\.[^/]+)$|\.(?:test|spec)\.[^/]+$/i;

/** Physical source lines, including comments; intentionally not a language parser. */
export function countSourceLines(bytes: Buffer): Omit<LineCounts, 'files'> | null {
  if (bytes.includes(0)) return null;
  const text = bytes.toString('utf8');
  if (!text) return { total: 0, nonblank: 0 };
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  return { total: lines.length, nonblank: lines.filter(line => line.trim().length > 0).length };
}

export function classifySourceFile(path: string): 'production' | 'tests' | null {
  if (EXCLUDED_PATH.test(path) || !SOURCE_EXTENSIONS.test(path)) return null;
  return TEST_PATH.test(path) ? 'tests' : 'production';
}

type Commit = { sha: string; timestamp: number };
type BlobCounts = Omit<LineCounts, 'files'> | null;
interface ScanLimits { commits: number; snapshots: number; files: number; blobBytes: number; totalBytes: number; durationMs: number }
const DEFAULT_LIMITS: ScanLimits = { commits: 1200, snapshots: 32, files: 5000, blobBytes: 1024 * 1024, totalBytes: 64 * 1024 * 1024, durationMs: 25_000 };
const emptyCounts = (): LineCounts => ({ total: 0, nonblank: 0, files: 0 });
const add = (target: LineCounts, value: Omit<LineCounts, 'files'>) => { target.total += value.total; target.nonblank += value.nonblank; target.files++; };

function git(cwd: string, args: string[], deadline: number, maxBuffer = 4 * 1024 * 1024, input?: string): Promise<Buffer> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error('scan_limit'));
  return new Promise((res, rej) => {
    const child = execFile('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
      cwd, windowsHide: true, encoding: 'buffer', maxBuffer, timeout: Math.min(remaining, 8000),
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout) => error ? rej(error) : res(stdout));
    child.stdin?.on('error', () => { /* callback reports process failure */ });
    child.stdin?.end(input);
  });
}

/** Read-only, bounded snapshots. All git object reads use validated hashes, not user expressions. */
export class RepositoryAnalyticsService {
  private readonly cache = new Map<string, { expiresAt: number; report: RepositoryAnalyticsReport }>();
  private readonly flights = new Map<string, Promise<RepositoryAnalyticsReport>>();
  private readonly limits: ScanLimits;

  constructor(options?: { limits?: Partial<ScanLimits>; cacheMs?: number }) {
    this.limits = { ...DEFAULT_LIMITS };
    for (const key of Object.keys(DEFAULT_LIMITS) as Array<keyof ScanLimits>) {
      const value = options?.limits?.[key];
      if (value !== undefined && Number.isFinite(value)) this.limits[key] = Math.max(1, Math.min(DEFAULT_LIMITS[key], Math.floor(value)));
    }
    this.cacheMs = Math.max(0, Math.min(120_000, options?.cacheMs ?? 120_000));
  }
  private readonly cacheMs: number;

  async read(repository: AnalyticsRepository, branch = 'HEAD'): Promise<RepositoryAnalyticsReport> {
    const key = JSON.stringify([repository.id, repository.name, resolve(repository.path), branch]);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.report;
    const flight = this.flights.get(key);
    if (flight) return flight;
    if (this.flights.size >= 2) {
      const report = this.base(repository, branch);
      report.status = 'error'; report.error = 'scan_limit';
      return report;
    }
    const work = this.scan(repository, branch).then(report => {
      if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expiresAt: Date.now() + (report.status === 'error' ? Math.min(5000, this.cacheMs) : this.cacheMs), report });
      return report;
    }).finally(() => this.flights.delete(key));
    this.flights.set(key, work);
    return work;
  }

  private base(repository: AnalyticsRepository, branch: string): RepositoryAnalyticsReport {
    return {
      object: 'conduit.repository_analytics', repository: { id: repository.id, name: repository.name }, branch,
      branches: [], branchesTruncated: false, generatedAt: Date.now(), status: 'empty', snapshots: [],
      coverage: { source: 'committed-source', firstParent: true, historyTruncated: false, sampled: false, commits: 0,
        candidates: 0, omittedSnapshots: 0, oldestAt: null, newestAt: null, historyDays: 0,
        maxCommits: this.limits.commits, maxSnapshots: this.limits.snapshots,
        excluded: ['Non-source extensions', 'Vendor, build, fixture and generated paths', 'Binary files', 'Symlinks and submodules', 'Uncommitted changes'],
      },
    };
  }

  private async scan(repository: AnalyticsRepository, branch: string): Promise<RepositoryAnalyticsReport> {
    const report = this.base(repository, branch), deadline = Date.now() + this.limits.durationMs;
    if (branch !== 'HEAD' && (branch.length > 240 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/'))) {
      report.status = 'error'; report.error = 'invalid_branch'; return report;
    }
    try {
      // A registered subdirectory must not implicitly grant access to its parent repository.
      const configuredRoot = await realpath(repository.path);
      const discoveredRoot = await realpath((await git(repository.path, ['rev-parse', '--show-toplevel'], deadline)).toString('utf8').trim());
      const normalizeRoot = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
      if (normalizeRoot(configuredRoot) !== normalizeRoot(discoveredRoot)) throw new Error('unavailable');
      const branchOutput = (await git(repository.path, ['for-each-ref', '--count=101', '--sort=refname', '--format=%(refname:short)', 'refs/heads/'], deadline)).toString('utf8').trim();
      const branches = branchOutput ? branchOutput.split('\n').map(value => value.trim()).filter(Boolean) : [];
      report.branches = branches.slice(0, 100); report.branchesTruncated = branches.length > 100;
      if (branch === 'HEAD') {
        try { report.branch = (await git(repository.path, ['symbolic-ref', '--quiet', '--short', 'HEAD'], deadline)).toString('utf8').trim(); } catch { report.branch = 'HEAD'; }
      } else if (!branches.includes(branch)) {
        // A branch outside the selector's first 100 is still accepted only as an exact local ref.
        try { await git(repository.path, ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch], deadline); }
        catch { report.status = 'error'; report.error = 'invalid_branch'; return report; }
      }
      let head: string;
      try { head = (await git(repository.path, ['rev-parse', '--verify', '--end-of-options', (branch === 'HEAD' ? 'HEAD' : 'refs/heads/' + branch) + '^{commit}'], deadline)).toString('ascii').trim(); }
      catch { if (!branches.length && branch === 'HEAD') return report; throw new Error('unavailable'); }
      if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error('unavailable');
      const raw = (await git(repository.path, ['log', '--first-parent', '--format=%H %ct', '-n', String(this.limits.commits + 1), head, '--'], deadline)).toString('ascii').trim();
      const commits: Commit[] = raw.split('\n').map(line => line.trim().split(' ')).filter(([sha, time]) => /^[a-f0-9]{40,64}$/.test(sha) && /^\d+$/.test(time)).map(([sha, time]) => ({ sha, timestamp: Number(time) * 1000 }));
      report.coverage.historyTruncated = commits.length > this.limits.commits;
      commits.splice(this.limits.commits);
      report.coverage.commits = commits.length;
      if (!commits.length) return report;
      // Keep the newest commit per UTC day and the exact oldest inspected baseline.
      const days = new Set<string>();
      const daily = commits.filter(commit => { const day = new Date(commit.timestamp).toISOString().slice(0, 10); if (days.has(day)) return false; days.add(day); return true; });
      const oldest = commits.at(-1)!;
      if (!daily.some(commit => commit.sha === oldest.sha)) daily.push(oldest);
      report.coverage.candidates = daily.length;
      const count = Math.min(this.limits.snapshots, daily.length);
      const selected = Array.from({ length: count }, (_, i) => daily[count === 1 ? 0 : Math.round(i * (daily.length - 1) / (count - 1))]);
      report.coverage.sampled = selected.length < daily.length;
      const blobCache = new Map<string, BlobCounts>();
      const budget = { bytes: this.limits.totalBytes };
      for (const commit of selected) {
        try { report.snapshots.push(await this.snapshot(repository.path, commit, deadline, blobCache, budget)); }
        catch { report.coverage.omittedSnapshots++; }
      }
      // Commit clocks can move backwards; the chart is explicitly ordered by recorded time.
      report.snapshots.sort((a, b) => a.timestamp - b.timestamp || selected.findIndex(c => c.sha === b.sha) - selected.findIndex(c => c.sha === a.sha));
      report.coverage.oldestAt = Math.min(...commits.map(commit => commit.timestamp));
      report.coverage.newestAt = Math.max(...commits.map(commit => commit.timestamp));
      report.coverage.historyDays = Math.max(1, Math.ceil((report.coverage.newestAt - report.coverage.oldestAt) / 86_400_000));
      report.status = report.snapshots.length ? (report.snapshots.some(snapshot => !snapshot.complete) || report.coverage.omittedSnapshots ? 'partial' : 'ready') : 'error';
      if (report.status === 'error') report.error = 'scan_limit';
    } catch { report.status = 'error'; report.error = 'unavailable'; }
    return report;
  }

  private async snapshot(cwd: string, commit: Commit, deadline: number, cache: Map<string, BlobCounts>, budget: { bytes: number }): Promise<RepositorySnapshot> {
    const output = await git(cwd, ['ls-tree', '-r', '-z', '-l', commit.sha, '--'], deadline, 8 * 1024 * 1024);
    const snapshot: RepositorySnapshot = { ...commit, production: emptyCounts(), tests: emptyCounts(), directories: [], excludedFiles: 0, skippedFiles: 0, complete: true };
    const entries: Array<{ path: string; sha: string; size: number; category: 'production' | 'tests' }> = [];
    const missing = new Map<string, number>();
    for (const row of output.toString('utf8').split('\0')) {
      if (!row) continue;
      const match = /^(\d+) (\w+) ([a-f0-9]{40,64})\s+(-|\d+)\t([\s\S]+)$/.exec(row);
      if (!match) { snapshot.skippedFiles++; continue; }
      const [, mode, type, sha, sizeText, path] = match;
      const category = classifySourceFile(path);
      if (!category || type !== 'blob' || !/^100(?:644|755)$/.test(mode)) { snapshot.excludedFiles++; continue; }
      const size = Number(sizeText);
      if (entries.length >= this.limits.files || size > this.limits.blobBytes || !Number.isFinite(size)) { snapshot.skippedFiles++; continue; }
      if (!cache.has(sha) && !missing.has(sha)) {
        if (size > budget.bytes) { snapshot.skippedFiles++; continue; }
        budget.bytes -= size; missing.set(sha, size);
      }
      entries.push({ path, sha, size, category });
    }
    // Batching immutable object IDs avoids one subprocess per file and never opens workspace files.
    const ids = [...missing.keys()];
    for (let index = 0; index < ids.length; index += 128) {
      const batch = ids.slice(index, index + 128);
      const maxBuffer = batch.reduce((sum, sha) => sum + missing.get(sha)! + 100, 1024);
      const bytes = await git(cwd, ['cat-file', '--batch'], deadline, maxBuffer, batch.join('\n') + '\n');
      let offset = 0;
      for (const sha of batch) {
        const end = bytes.indexOf(10, offset);
        if (end < 0) throw new Error('Invalid Git blob response');
        const header = bytes.subarray(offset, end).toString('ascii').split(' '), size = Number(header[2]);
        if (header[0] !== sha || header[1] !== 'blob' || size !== missing.get(sha) || end + 1 + size >= bytes.length) throw new Error('Invalid Git blob response');
        cache.set(sha, countSourceLines(bytes.subarray(end + 1, end + 1 + size)));
        offset = end + size + 2;
      }
    }
    const directories = new Map<string, { name: string; production: LineCounts; tests: LineCounts }>();
    for (const entry of entries) {
      const counts = cache.get(entry.sha);
      if (!counts) { snapshot.excludedFiles++; continue; }
      add(snapshot[entry.category], counts);
      const name = entry.path.includes('/') ? entry.path.split('/')[0] : '(root)';
      const directory = directories.get(name) ?? { name, production: emptyCounts(), tests: emptyCounts() };
      add(directory[entry.category], counts); directories.set(name, directory);
    }
    snapshot.directories = [...directories.values()].sort((a, b) => b.production.nonblank + b.tests.nonblank - a.production.nonblank - a.tests.nonblank);
    snapshot.complete = snapshot.skippedFiles === 0;
    return snapshot;
  }
}
