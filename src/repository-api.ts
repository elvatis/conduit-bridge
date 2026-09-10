import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BridgeConfig } from './types.js';
import { authenticatePlatformOperator, platformCapabilityAllowed, requirePlatformCapability, type PlatformOperatorContext } from './platform-auth.js';
import { GitWorkspaceError, GitWorkspaceService, type GitWorkspaceAction } from './git-workspace.js';
import { RepositoryAnalyticsService } from './repository-analytics.js';

interface Workspace { id: string; name: string; path: string }
interface Repository extends Workspace {}
interface Dependencies {
  cfg(): BridgeConfig;
  workspaces(): Workspace[];
  repositories(): Repository[];
  repositoryWorkspace(repository: Repository): string;
  authorize(actor: PlatformOperatorContext, workspaceId: string, write: boolean): void;
}

/** Git paths always come from registered server configuration, never request paths. */
export class RepositoryApi {
  private analytics = new RepositoryAnalyticsService();
  private git = new Map<string, GitWorkspaceService>();
  constructor(private deps: Dependencies) {}

  async handle(req: IncomingMessage, res: ServerResponse, readBody: () => Promise<string>): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://localhost');
    const route = url.pathname;
    if (!route.startsWith('/api/git-workspace/') && !['/v1/analytics/repositories', '/v1/analytics/repository'].includes(route)) return false;
    const send = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const actor = authenticatePlatformOperator(req.headers.authorization, this.deps.cfg(), { isLoopback: ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') });
      if (!actor) { send(401, { error: { message: 'A valid platform bearer token is required.' } }); return true; }
      requirePlatformCapability(actor, 'view');
      const method = req.method || 'GET';
      const write = route === '/api/git-workspace/action';
      if (method !== (write ? 'POST' : 'GET')) { send(405, { error: { message: 'Method not allowed.' } }); return true; }
      if (route === '/v1/analytics/repositories') {
        const data = this.deps.repositories().filter(repository => {
          try { return platformCapabilityAllowed(actor, 'view', this.deps.repositoryWorkspace(repository)); } catch { return false; }
        }).map(({ id, name }) => ({ id, name }));
        send(200, { data }); return true;
      }
      if (route === '/v1/analytics/repository') {
        const repository = this.deps.repositories().find(item => item.id === url.searchParams.get('repository'));
        if (!repository) throw new GitWorkspaceError('Select a registered repository.', 404);
        const workspaceId = this.deps.repositoryWorkspace(repository);
        requirePlatformCapability(actor, 'view', workspaceId);
        this.deps.authorize(actor, workspaceId, false);
        send(200, await this.analytics.read(repository, url.searchParams.get('branch') || 'HEAD')); return true;
      }
      if (!['/api/git-workspace/snapshot', '/api/git-workspace/diff', '/api/git-workspace/action'].includes(route)) { send(404, { error: { message: 'Unknown Git workspace endpoint.' } }); return true; }
      let input: Record<string, unknown> = Object.fromEntries(url.searchParams);
      if (write) {
        try { const body = JSON.parse(await readBody()); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); input = body; }
        catch { throw new GitWorkspaceError('Expected a JSON object.'); }
      }
      const text = (key: string, max = 300): string | undefined => {
        const value = input[key];
        if (value === undefined || value === '') return undefined;
        if (typeof value !== 'string' || value.length > max || /[\0\r\n]/.test(value)) throw new GitWorkspaceError('Invalid ' + key + '.');
        return value;
      };
      const workspace = this.deps.workspaces().find(item => item.id === text('workspaceId'));
      if (!workspace) throw new GitWorkspaceError('Select a registered workspace.', 404);
      requirePlatformCapability(actor, write ? 'admin' : 'view', workspace.id);
      this.deps.authorize(actor, workspace.id, write);
      const key = workspace.id + '\0' + workspace.path;
      let service = this.git.get(key);
      if (!service) {
        service = new GitWorkspaceService(workspace.path);
        if (this.git.size >= 16) {
          for (const [k, s] of this.git.entries()) {
            if (!s.isMutating()) {
              this.git.delete(k);
              break;
            }
          }
        }
        this.git.set(key, service);
      }
      const worktree = text('worktree', 20);
      if (worktree && !/^[a-f0-9]{20}$/.test(worktree)) throw new GitWorkspaceError('Invalid worktree identifier.');
      if (write) {
        const action = text('action') as GitWorkspaceAction;
        send(200, await service.action({ action, worktree, name: text('name', 120) }));
      } else if (route.endsWith('/snapshot')) {
        if (input.allBranches !== undefined && !['true', 'false'].includes(String(input.allBranches))) throw new GitWorkspaceError('Invalid branch filter.');
        send(200, await service.snapshot({ worktree, allBranches: input.allBranches === 'true', branch: text('branch') }));
      } else {
        const mode = text('mode') || 'history';
        if (mode !== 'history' && mode !== 'changes') throw new GitWorkspaceError('Invalid diff mode.');
        send(200, await service.diff({ worktree, mode, commit: text('commit', 64), path: text('path', 4096) }));
      }
    } catch (error) {
      const status = error instanceof GitWorkspaceError ? error.statusCode : Number((error as { status?: number }).status) || 500;
      send(status, { error: { message: status >= 500 ? 'Repository data could not be loaded.' : (error as Error).message } });
    }
    return true;
  }
}
