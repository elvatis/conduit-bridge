import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { SkillError, type SkillDefinition, type SkillExecutionContext } from './index.js';
import { filesystemSkill, resolveSkillPath } from './filesystem.js';
import { runLocalTool, tgrepCacheDirectory, tgrepRpc, TGREP_EXCLUSIONS } from '../providers/llama-server.js';
import { isPathWithin } from '../workspaces.js';

/** A verified workspace match. Column is a one-based UTF-8 byte offset, as in ripgrep. */
export interface SearchResult { file: string; line: number; column: number; snippet: string }
/** Workspace-relative query options; an absolute cwd is accepted only within the bound workspace. */
export interface CodeSearchOptions { maxResults?: number; cwd?: string }
const globs = ['!.git/**', '!.ssh/**', '!.conduit/**', '!.codex/**', '!.agents/**', '!**/.env', '!**/.env.*', '!node_modules/**'];

/** Scoped indexed code search with a native ripgrep fallback. Every returned snippet is re-read through file authorization. */
export class CodeSearch {
  constructor(private readonly context: SkillExecutionContext) {}
  private root(cwd?: string): string {
    const workspace = this.context.workspace;
    if (!workspace) throw new SkillError('Select a workspace for code search');
    const requested = cwd || process.env.TGREP_INDEX_PATH || '.';
    if (isAbsolute(requested) && !isPathWithin(realpathSync.native(workspace.root), realpathSync.native(requested))) throw new SkillError('Search root is outside the workspace', 403);
    const root = resolveSkillPath(this.context, isAbsolute(requested) ? relative(workspace.root, requested) : requested);
    if (!statSync(root).isDirectory()) throw new SkillError('Search root must be a directory');
    return root;
  }
  private port(root: string): number | undefined {
    const configured = process.env.TGREP_URL;
    if (configured) {
      let url: URL; try { url = new URL(configured); } catch { throw new SkillError('Invalid TGREP_URL', 503); }
      if (!['tcp:', 'http:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) throw new SkillError('TGREP_URL must identify a loopback TCP endpoint', 503);
      return Number(url.port || 7700);
    }
    const infoPath = join(tgrepCacheDirectory(root), 'serve.json');
    if (!existsSync(infoPath) || statSync(infoPath).size > 4096) return undefined;
    try { return JSON.parse(readFileSync(infoPath, 'utf8')).port; } catch { return undefined; }
  }
  /** Search tgrep's documented TCP JSON-RPC API or CLI; use rg when native tgrep is unavailable. */
  async search(pattern: string, options: CodeSearchOptions = {}): Promise<SearchResult[]> {
    if (typeof pattern !== 'string' || !pattern || pattern.length > 2000 || /[\0\r\n]/.test(pattern)) throw new SkillError('Search pattern must be a single line of 1 to 2000 characters');
    const maxResults = options.maxResults ?? 100;
    if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 200) throw new SkillError('maxResults must be between 1 and 200');
    await this.context.authorize('read', { skill: 'code-search' });
    const root = this.root(options.cwd); const port = this.port(root);
    let rows: Array<{ file: string; line: number; column: number }> | undefined;
    if (port) {
      try {
        const response = await tgrepRpc(port, 'search', { pattern, max_count: maxResults, glob: globs, max_filesize: 65536, detail: true }, this.context.signal);
        if (!Array.isArray(response.matches)) throw new Error('Invalid match response');
        rows = response.matches.filter((row: any) => row?.type === 'match').map((row: any) => ({ file: row.file, line: row.line, column: (row.columns?.[0] ?? 1) }));
      } catch { this.context.signal.throwIfAborted(); }
    }
    if (!rows) {
      const common = ['--json', '--max-count', String(maxResults), '--max-filesize', '64K', ...globs.flatMap(glob => ['--glob', glob]), '-e', pattern, '.'];
      let output;
      try {
        output = await runLocalTool(process.env.TGREP_BINARY || 'tgrep', ['--index-path', tgrepCacheDirectory(root), ...common], root, this.context.signal);
        if (output.exitCode !== 0 && output.exitCode !== 1) throw new Error('tgrep query failed');
      } catch {
        this.context.signal.throwIfAborted();
        output = await runLocalTool('rg', ['--no-config', ...common], root, this.context.signal);
      }
      if (output.exitCode !== 0 && output.exitCode !== 1) throw new SkillError('Code search failed; check the regular expression and native tool installation');
      rows = output.stdout.split(/\r?\n/).flatMap(line => {
        try {
          const row = JSON.parse(line);
          return row.type === 'match' && typeof row.data?.path?.text === 'string' ? [{ file: row.data.path.text, line: row.data.line_number, column: (row.data.submatches?.[0]?.start ?? 0) + 1 }] : [];
        } catch { return []; }
      });
    }
    const results: SearchResult[] = [];
    for (const row of rows) {
      if (results.length >= maxResults) break;
      this.context.signal.throwIfAborted();
      if (typeof row.file !== 'string' || !Number.isSafeInteger(row.line) || row.line < 1 || !Number.isSafeInteger(row.column) || row.column < 1) continue;
      try {
        const absolute = isAbsolute(row.file) ? row.file : join(root, row.file);
        if (!isPathWithin(root, absolute)) continue;
        const path = relative(this.context.workspace!.root, absolute);
        await this.context.authorize('read', { skill: 'filesystem' });
        const content = await filesystemSkill.execute({ action: 'read', path }, this.context) as { content: string };
        const snippet = content.content.split(/\r?\n/)[row.line - 1];
        if (snippet === undefined) continue;
        results.push({ file: path.replace(/\\/g, '/'), line: row.line, column: row.column, snippet: snippet.slice(0, 1000) });
      } catch { this.context.signal.throwIfAborted(); /* Refuse stale, linked, large or credential/control matches. */ }
    }
    return results;
  }
  /** Build the selected workspace's index without writing into its source tree. */
  async index(directory = '.'): Promise<void> { await this.build(directory, false); }
  /** Force a complete rebuild of the selected workspace index. */
  async reindex(directory = '.'): Promise<void> { await this.build(directory, true); }
  private async build(directory: string, force: boolean): Promise<void> {
    await this.context.authorize('execute', { skill: 'code-search' });
    const root = this.root(directory);
    const port = this.port(root);
    if (port) {
      let running = false;
      try { await tgrepRpc(port, 'status', {}, this.context.signal); running = true; } catch { this.context.signal.throwIfAborted(); }
      if (running) {
        // A configured external daemon must have an explicit root binding before mutating its index.
        if (process.env.TGREP_URL && (!process.env.TGREP_INDEX_PATH || realpathSync.native(process.env.TGREP_INDEX_PATH) !== root)) throw new SkillError('Set TGREP_INDEX_PATH to the daemon workspace before rebuilding an external index', 403);
        // Upstream reload performs a complete rebuild while holding its own index lock.
        await tgrepRpc(port, 'reload', {}, this.context.signal); return;
      }
    }
    const result = await runLocalTool(process.env.TGREP_BINARY || 'tgrep', ['index', root, '--index-path', tgrepCacheDirectory(root), '--max-filesize', '64K', ...(force ? ['--force'] : []), ...TGREP_EXCLUSIONS.flatMap(path => ['--exclude', path])], root, this.context.signal, 60000);
    if (result.exitCode !== 0) throw new SkillError('tgrep indexing failed', 502);
  }
  /** Return daemon availability and only this authorized workspace's index state. */
  async serverStatus(): Promise<{ running: boolean; indexed: string[] }> {
    await this.context.authorize('read', { skill: 'code-search' });
    const root = this.root(); const port = this.port(root);
    if (port) try { const result = await tgrepRpc(port, 'status', {}, this.context.signal); return { running: true, indexed: result.indexing === false ? [root] : [] }; } catch { this.context.signal.throwIfAborted(); }
    return { running: false, indexed: [] };
  }
}
/** Expose scoped regex search and explicit index management. */
export const codeSearchSkill: SkillDefinition = {
  name: 'code-search', description: 'Search workspace code through tgrep TCP/CLI or ripgrep; manage indexes with explicit approval.', effect: input => ['index', 'reindex'].includes(input.action as string) ? 'execute' : 'read',
  schema: { type: 'object', additionalProperties: false, required: ['action'], properties: { action: { type: 'string', enum: ['search', 'index', 'reindex', 'status'] }, pattern: { type: 'string', maxLength: 2000 }, cwd: { type: 'string', maxLength: 4096 }, maxResults: { type: 'integer', minimum: 1, maximum: 200 } } },
  async execute(input, context) {
    const search = new CodeSearch(context);
    if (input.action === 'search') return search.search(input.pattern as string, { cwd: input.cwd as string | undefined, maxResults: input.maxResults as number | undefined });
    if (input.action === 'status') return search.serverStatus();
    if (input.action === 'index') await search.index((input.cwd ?? '.') as string);
    else if (input.action === 'reindex') await search.reindex((input.cwd ?? '.') as string);
    else throw new SkillError('Unknown code search action');
    return { indexed: true };
  },
};
