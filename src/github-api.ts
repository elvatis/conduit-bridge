/** GitHub response failure without request bodies, credentials or upstream text. */
export class GitHubApiError extends Error {
  constructor(message: string, readonly status = 502, readonly retryAfter?: string) { super(message); this.name = 'GitHubApiError'; }
}

/** Injectable transport options for the fixed public GitHub API origin. */
export interface GitHubApiOptions {
  token?: () => string | undefined;
  fetch?: typeof globalThis.fetch;
}

/** Fixed-origin, bounded GitHub client. Mutations are never automatically retried. */
export class GitHubApi {
  private readonly fetch: typeof globalThis.fetch;
  private readonly token: () => string | undefined;

  constructor(options: GitHubApiOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.token = options.token ?? (() => process.env.GITHUB_TOKEN);
  }

  /** Send an authenticated REST or GraphQL request with a bounded response. */
  async request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n\0]/.test(path)) throw new GitHubApiError('Invalid GitHub API path', 400);
    const target = new URL(path, 'https://api.github.com');
    if (target.origin !== 'https://api.github.com') throw new GitHubApiError('Invalid GitHub API origin', 400);
    const token = this.token();
    if (!token || token.length > 4096 || /[\s\0]/.test(token)) throw new GitHubApiError('GITHUB_TOKEN is not configured for this integration', 503);
    const signal = AbortSignal.any([AbortSignal.timeout(30000), ...(options.signal ? [options.signal] : [])]);
    let response: Response;
    try {
      response = await this.fetch(target, {
        method: options.method ?? 'GET', redirect: 'error', signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'conduit-bridge' },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch {
      if (signal.aborted) throw new GitHubApiError('GitHub request cancelled or timed out', 504);
      throw new GitHubApiError('GitHub request failed', 502);
    }
    if (!response.ok) {
      await response.body?.cancel();
      const status = [401, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
      throw new GitHubApiError(`GitHub API returned HTTP ${response.status}; check token permissions and resource identifiers`, status, response.headers.get('retry-after') ?? undefined);
    }
    if (response.status === 204) return undefined as T;
    const reader = response.body?.getReader();
    if (!reader) throw new GitHubApiError('GitHub returned an empty response');
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new GitHubApiError('GitHub response exceeds 2 MiB'); }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError(signal.aborted ? 'GitHub response cancelled or timed out' : 'GitHub returned an invalid response');
    } finally { reader.releaseLock(); }
  }

  /** Execute a fixed GraphQL document with data supplied as variables. */
  async graphql<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const payload = await this.request<{ data?: T; errors?: unknown[] }>('/graphql', { method: 'POST', body: { query, variables }, signal });
    if (payload.errors?.length || !payload.data) throw new GitHubApiError('GitHub GraphQL request failed; check project permissions and field types');
    return payload.data;
  }
}

/** Validate one repository owner or repository name before URL interpolation. */
export function githubSegment(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value) || value === '.' || value === '..') throw new GitHubApiError(`Invalid ${label}`, 400);
  return value;
}

/** Validate a GraphQL node identifier without interpreting its opaque encoding. */
export function githubNodeId(value: unknown, label = 'GitHub node ID'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_+=/-]{1,256}$/.test(value)) throw new GitHubApiError(`Invalid ${label}`, 400);
  return value;
}
