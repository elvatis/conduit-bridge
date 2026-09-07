import { describe, expect, it, vi } from 'vitest';
import { GitHubProjectsProvider } from '../src/providers/github-projects.js';

function fixture() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const provider = new GitHubProjectsProvider({ token: () => 'fixture-value', fetch });
  const reply = (data: unknown) => fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data })));
  const request = (index = 0) => JSON.parse(fetch.mock.calls[index][1]!.body as string);
  return { fetch, provider, reply, request };
}
describe('GitHub Projects v2 provider', () => {
  it('uses owner-specific queries and forwards bounded cursor pagination', async () => {
    const f = fixture(); const page = { nodes: [{ id: 'PVT_1', title: 'Project' }], pageInfo: { hasNextPage: true, endCursor: 'cursor' } };
    f.reply({ owner: { projectsV2: page } });
    expect(await f.provider.listProjects('octo', 'organization', { first: 2, after: 'previous' })).toEqual(page);
    expect(f.request()).toMatchObject({ variables: { owner: 'octo', first: 2, after: 'previous' } });
    expect(f.request().query).toContain('owner:organization(login:$owner)');
    f.reply({ owner: { projectsV2: page } }); await f.provider.listProjects('octo', 'user'); expect(f.request(1).query).toContain('owner:user');
    await expect(f.provider.listProjects('octo', 'user', { first: 101 })).rejects.toThrow('pagination');
    await expect(f.provider.listProjects('bad/owner', 'user')).rejects.toThrow('owner');
  });
  it('reads project fields and the issue, PR and draft content union', async () => {
    const f = fixture(); f.reply({ node: { id: 'PVT_1', fields: { nodes: [], pageInfo: {} } } });
    expect(await f.provider.getProject('PVT_1')).toMatchObject({ id: 'PVT_1' });
    const items = { nodes: [{ id: 'PVTI_1', type: 'DRAFT_ISSUE', content: { __typename: 'DraftIssue', id: 'DI_1', title: 'Draft' } }], pageInfo: { hasNextPage: false, endCursor: null } };
    f.reply({ node: { items } }); expect(await f.provider.listItems('PVT_1')).toEqual(items);
    expect(f.request(1).query).toContain('... on Issue'); expect(f.request(1).query).toContain('... on PullRequest'); expect(f.request(1).query).toContain('... on DraftIssue');
    f.reply({ node: null }); await expect(f.provider.getProject('PVT_missing')).rejects.toMatchObject({ status: 404 });
  });
  it('adds existing and draft items using variables, not injected query text', async () => {
    const f = fixture(); f.reply({ addProjectV2ItemById: { item: { id: 'PVTI_1' } } });
    expect(await f.provider.addItem('PVT_1', { contentId: 'I_1' })).toEqual({ id: 'PVTI_1' });
    f.reply({ addProjectV2DraftIssue: { projectItem: { id: 'PVTI_2' } } });
    const title = 'quote " } mutation { pretend';
    await f.provider.addItem('PVT_1', { title, body: 'synthetic draft' });
    expect(f.request(1).variables.title).toBe(title); expect(f.request(1).query).not.toContain(title);
  });
  it('updates every supported custom field type, clears fields and removes membership only', async () => {
    const f = fixture();
    for (const value of [{ text: 'Done' }, { number: 3 }, { date: '2026-09-07' }, { singleSelectOptionId: 'option' }, { iterationId: 'iteration' }]) { f.reply({ updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_1' } } }); await f.provider.updateItemField('PVT_1', 'PVTI_1', 'FIELD_1', value); }
    f.reply({ clearProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_1' } } }); await f.provider.updateItemField('PVT_1', 'PVTI_1', 'FIELD_1', null);
    expect(f.request(5).query).toContain('clearProjectV2ItemFieldValue');
    f.reply({ deleteProjectV2Item: { deletedItemId: 'PVTI_1' } });
    expect(await f.provider.removeItem('PVT_1', 'PVTI_1')).toEqual({ deletedItemId: 'PVTI_1' });
    expect(f.request(6).query).toContain('deleteProjectV2Item'); expect(f.request(6).query).not.toContain('deleteIssue');
    for (const bad of [{ date: '2026-02-30' }, { text: 'x', number: 2 }, { number: Infinity }, { field: 'bad' }]) await expect(f.provider.updateItemField('PVT_1', 'PVTI_1', 'FIELD_1', bad as any)).rejects.toThrow('field value');
  });
});
