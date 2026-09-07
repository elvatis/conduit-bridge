import { describe, expect, it, vi } from 'vitest';
import { GitHubApi } from '../src/github-api.js';
import { redactSecrets } from '../src/redact.js';

describe('fixed-origin GitHub client', () => {
  it('keeps credentials on api.github.com with redirect refusal and variables', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true } })));
    const api = new GitHubApi({ token: () => 'fixture-value', fetch });
    expect(await api.graphql('query($id:ID!){node(id:$id){id}}', { id: 'opaque' })).toEqual({ ok: true });
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.github.com/graphql');
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer fixture-value' } });
    await expect(api.request('//evil.example/')).rejects.toThrow('path');
    await expect(api.request('https://evil.example/')).rejects.toThrow('path');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('fails closed without tokens and strips transport/upstream error details', async () => {
    const fetch = vi.fn(async () => { throw new Error('credential=must-not-escape'); });
    await expect(new GitHubApi({ token: () => undefined, fetch }).request('/graphql')).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
    await expect(new GitHubApi({ token: () => 'fixture-value', fetch }).request('/graphql')).rejects.toThrow(/^GitHub request failed$/);
    const denied = new GitHubApi({ token: () => 'fixture-value', fetch: vi.fn(async () => new Response('must-not-escape', { status: 403 })) });
    await expect(denied.request('/graphql')).rejects.toMatchObject({ status: 403, message: 'GitHub API returned HTTP 403; check token permissions and resource identifiers' });
    for (const token of ['ghp_1234567890abcdefghijklmnop', 'github_pat_1234567890_abcdefghijklmnop']) expect(redactSecrets(`GitHub failed with ${token}`)).toBe('GitHub failed with [redacted]');
  });
  it('rejects oversized or partial GraphQL results and accepts bodyless dispatch', async () => {
    const reply = vi.fn<typeof globalThis.fetch>();
    const api = new GitHubApi({ token: () => 'fixture-value', fetch: reply });
    reply.mockResolvedValueOnce(new Response('x'.repeat(2 * 1024 * 1024 + 1)));
    await expect(api.request('/graphql')).rejects.toThrow('2 MiB');
    reply.mockResolvedValueOnce(new Response(JSON.stringify({ data: { partial: true }, errors: [{ message: 'private details' }] })));
    await expect(api.graphql('query{x}', {})).rejects.toThrow(/^GitHub GraphQL request failed;/);
    reply.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await api.request('/repos/a/b/actions/workflows/test.yml/dispatches', { method: 'POST', body: { ref: 'main' } })).toBeUndefined();
  });
});
