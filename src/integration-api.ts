import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BridgeConfig, GitHubProjectLink } from './types.js';
import type { WorkspaceManager } from './workspaces.js';
import { authenticatePlatformOperator, PlatformAuthorizationError, requirePlatformCapability, type PlatformOperatorContext } from './platform-auth.js';
import { GitHubProjectsProvider, type GitHubProjectFieldValue } from './providers/github-projects.js';
import { GitHubApiError } from './github-api.js';
import { SkillError, type SkillExecutionContext, type SkillRegistry } from './skills/index.js';
import { redactSecrets } from './redact.js';

/** Host bindings for authenticated tools and remote project operations. */
export interface IntegrationApiDependencies {
  cfg(): BridgeConfig;
  workspaces: WorkspaceManager;
  skills: SkillRegistry;
  githubProjects?: GitHubProjectsProvider;
  toolContext(operator: PlatformOperatorContext, workspaceId: string | undefined, signal: AbortSignal, approve: boolean, reauthorize: () => PlatformOperatorContext): SkillExecutionContext;
  acquire(): (() => void) | undefined;
  event(event: Record<string, unknown>): void;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SkillError('Request body must be an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 512) throw new SkillError(`Invalid ${name}`);
  return value;
}

/** Routes for explicit tool execution and remote GitHub Projects v2 operations. */
export class IntegrationApi {
  private readonly projects: GitHubProjectsProvider;
  private readonly active = new Set<AbortController>();
  constructor(private readonly deps: IntegrationApiDependencies) { this.projects = deps.githubProjects ?? new GitHubProjectsProvider(); }

  /** Cancel active tool and network operations when the host is stopping. */
  stop(): void { for (const controller of this.active) controller.abort(); }

  /** Handle only the new route families; all other routes remain with their existing owner. */
  async handle(req: IncomingMessage, res: ServerResponse, readBody: () => Promise<string>): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://localhost');
    const toolsRoute = url.pathname === '/v1/platform/tools' || url.pathname.startsWith('/v1/platform/tools/');
    const projectsRoute = url.pathname === '/api/github-projects' || url.pathname.startsWith('/api/github-projects/');
    if (!toolsRoute && !projectsRoute) return false;
    const operator = () => {
      const actor = authenticatePlatformOperator(req.headers.authorization, this.deps.cfg(), { isLoopback: ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') });
      if (!actor) throw new SkillError('A valid platform bearer token is required', 401);
      return actor;
    };
    let release: (() => void) | undefined;
    const controller = new AbortController();
    this.active.add(controller);
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]);
    try {
      const actor = operator();
      const reauthorize = () => { const current = operator(); if (current.operatorId !== actor.operatorId) throw new SkillError('Authorization changed during the request', 403); return current; };
      requirePlatformCapability(actor, 'view');
      const method = req.method || 'GET';
      if (method === 'GET' && toolsRoute && url.pathname === '/v1/platform/tools') { json(res, 200, { data: this.deps.skills.list() }); return true; }
      release = this.deps.acquire();
      if (!release) throw new SkillError('Integration concurrency or request limit reached', 429);
      let body: Record<string, unknown> = {};
      if (method !== 'GET' && method !== 'HEAD') {
        try { body = object(JSON.parse(await readBody())); } catch (error) { if (error instanceof SkillError) throw error; throw new SkillError('Invalid JSON request body'); }
      }
      if (toolsRoute) {
        const match = /^\/v1\/platform\/tools\/([a-z][a-z0-9-]{0,63})\/execute$/.exec(url.pathname);
        if (!match || method !== 'POST') throw new SkillError('Unknown tool endpoint', 404);
        if (Object.keys(body).some(key => !['arguments', 'workspaceId', 'approved'].includes(key)) || (body.approved !== undefined && typeof body.approved !== 'boolean')) throw new SkillError('Unknown or invalid tool execution option');
        const workspaceId = body.workspaceId === undefined ? undefined : text(body.workspaceId, 'workspaceId');
        const context = this.deps.toolContext(actor, workspaceId, signal, body.approved === true, reauthorize);
        const result = await this.deps.skills.execute(match[1], body.arguments ?? {}, context);
        this.deps.event({ type: 'tool_execution', skill: match[1], operatorId: actor.operatorId, workspaceId, status: 'completed' });
        if (!res.destroyed) json(res, 200, { skill: match[1], result });
        return true;
      }
      let segments: string[];
      try { segments = url.pathname.slice('/api/github-projects'.length).split('/').filter(Boolean).map(segment => decodeURIComponent(segment)); }
      catch { throw new SkillError('Invalid GitHub Projects path encoding'); }
      const page = { first: url.searchParams.has('first') ? Number(url.searchParams.get('first')) : undefined, after: url.searchParams.get('after') ?? undefined };
      const workspaceId = url.searchParams.get('workspaceId') || (typeof body.workspaceId === 'string' ? body.workspaceId : undefined);
      const authorizeProject = (projectId?: string, mutation = false) => {
        const current = reauthorize();
        if (mutation || !workspaceId) { requirePlatformCapability(current, 'admin'); return; }
        requirePlatformCapability(current, 'view', workspaceId);
        const workspace = this.deps.workspaces.listWorkspaces().find(item => item.id === workspaceId);
        if (!workspace?.githubProject || workspace.githubProject.projectId !== projectId) throw new SkillError('Project is not linked to this workspace', 403);
      };
      if (!segments.length && method === 'GET') {
        requirePlatformCapability(reauthorize(), 'admin');
        const owner = text(url.searchParams.get('owner'), 'owner');
        const ownerType = url.searchParams.get('ownerType') || 'organization';
        if (ownerType !== 'organization' && ownerType !== 'user') throw new SkillError('ownerType must be organization or user');
        json(res, 200, await this.projects.listProjects(owner, ownerType, page, signal));
      } else if (segments[0] === 'workspaces' && segments.length === 2) {
        const id = segments[1];
        requirePlatformCapability(reauthorize(), method === 'GET' ? 'view' : 'admin', id);
        if (method === 'GET') {
          const workspace = this.deps.workspaces.listWorkspaces().find(item => item.id === id);
          if (!workspace) throw new SkillError('Workspace not found', 404);
          json(res, 200, { workspaceId: id, githubProject: workspace.githubProject ?? null });
        } else if (method === 'PUT' || method === 'DELETE') {
          let project: GitHubProjectLink | null = null;
          if (method === 'PUT') {
            const supplied = object(body.githubProject);
            const remote = await this.projects.getProject(text(supplied.projectId, 'projectId'), {}, signal);
            if (remote.url !== supplied.projectUrl) throw new SkillError('Project URL does not match the remote project');
            project = { projectId: remote.id, projectUrl: remote.url, org: text(supplied.org, 'org'), ...(supplied.repo !== undefined ? { repo: text(supplied.repo, 'repo') } : {}) };
          }
          requirePlatformCapability(reauthorize(), 'admin', id);
          let workspace;
          try { workspace = this.deps.workspaces.setGitHubProject(id, project); } catch { throw new SkillError('Workspace or project association is invalid, or could not be saved'); }
          json(res, 200, { workspace });
        } else throw new SkillError('Unsupported workspace link operation', 405);
      } else if (segments.length === 1 && method === 'GET') {
        authorizeProject(segments[0]); json(res, 200, { project: await this.projects.getProject(segments[0], page, signal) });
      } else if (segments.length === 2 && segments[1] === 'items') {
        if (method === 'GET') { authorizeProject(segments[0]); json(res, 200, await this.projects.listItems(segments[0], page, signal)); }
        else if (method === 'POST') {
          authorizeProject(segments[0], true);
          if (body.body !== undefined && (typeof body.body !== 'string' || body.body.length > 65536)) throw new SkillError('Invalid body');
          const input = body.contentId !== undefined ? { contentId: text(body.contentId, 'contentId') } : { title: text(body.title, 'title'), ...(body.body !== undefined ? { body: body.body } : {}) };
          json(res, 201, { item: await this.projects.addItem(segments[0], input, signal) });
        } else throw new SkillError('Unsupported project item operation', 405);
      } else if (segments.length === 3 && segments[1] === 'items' && method === 'DELETE') {
        authorizeProject(segments[0], true); json(res, 200, await this.projects.removeItem(segments[0], segments[2], signal));
      } else if (segments.length === 5 && segments[1] === 'items' && segments[3] === 'fields' && method === 'PATCH') {
        authorizeProject(segments[0], true);
        json(res, 200, { item: await this.projects.updateItemField(segments[0], segments[2], segments[4], body.value as GitHubProjectFieldValue, signal) });
      } else throw new SkillError('Unknown GitHub Projects endpoint', 404);
      return true;
    } catch (error) {
      const suppliedStatus = error instanceof SkillError || error instanceof GitHubApiError || error instanceof PlatformAuthorizationError
        ? error.status : (error as { status?: unknown })?.status;
      const status = Number.isInteger(suppliedStatus) && (suppliedStatus as number) >= 400 && (suppliedStatus as number) <= 599 ? suppliedStatus as number : 500;
      const known = error instanceof SkillError || error instanceof GitHubApiError || error instanceof PlatformAuthorizationError;
      const message = known ? redactSecrets(error.message) : 'Integration operation failed';
      if (!res.headersSent && !res.destroyed) json(res, status, { error: { message, type: 'integration_error' } });
      return true;
    } finally { release?.(); this.active.delete(controller); res.removeListener('close', onClose); }
  }
}
