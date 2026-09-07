import { GitHubApi, GitHubApiError, githubNodeId, githubSegment, type GitHubApiOptions } from '../github-api.js';
import { CodeSearch, type CodeSearchOptions, type SearchResult } from '../skills/code-search.js';
import type { SkillExecutionContext } from '../skills/index.js';

/** Cursor pagination returned by GitHub Projects v2. */
export interface GitHubPage<T> { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
/** Public remote project metadata. */
export interface GitHubProject { id: string; number: number; title: string; url: string; closed: boolean; shortDescription?: string | null }
/** Issue, pull request or draft attached to a remote project. */
export interface GitHubProjectItem {
  id: string;
  type: string;
  content: { __typename: string; id: string; title: string; body?: string; number?: number; url?: string; state?: string } | null;
  fieldValues?: GitHubPage<Record<string, unknown>>;
}
/** One supported custom field value, or null to clear an existing value. */
export type GitHubProjectFieldValue = { text: string } | { number: number } | { date: string } | { singleSelectOptionId: string } | { iterationId: string } | null;
/** Page size is bounded and the opaque cursor comes from a previous result. */
export interface GitHubPageInput { first?: number; after?: string }

const PROJECT_FIELDS = 'id number title url closed shortDescription';
const ITEM_FIELDS = `id type content { __typename ... on Issue { id title number url state } ... on PullRequest { id title number url state } ... on DraftIssue { id title body } }`;
function pagination(input: GitHubPageInput = {}): { first: number; after: string | null } {
  const first = input.first ?? 50;
  if (!Number.isInteger(first) || first < 1 || first > 100 || (input.after !== undefined && (typeof input.after !== 'string' || input.after.length > 512))) throw new GitHubApiError('Invalid GitHub pagination', 400);
  return { first, after: input.after ?? null };
}

/** GitHub Projects v2 integration, independent of AI provider routing. */
export class GitHubProjectsProvider {
  /** Search local code in the caller's authorized linked workspace without sending code to GitHub. */
  async searchLocalRepository(pattern: string, context: SkillExecutionContext, options?: CodeSearchOptions): Promise<SearchResult[]> { return new CodeSearch(context).search(pattern, options); }
  private readonly api: GitHubApi;
  constructor(options: GitHubApiOptions = {}) { this.api = new GitHubApi(options); }

  /** List one page of projects owned by an organization or user. */
  async listProjects(owner: string, ownerType: 'organization' | 'user', page: GitHubPageInput = {}, signal?: AbortSignal): Promise<GitHubPage<GitHubProject>> {
    githubSegment(owner, 'project owner');
    if (!['organization', 'user'].includes(ownerType)) throw new GitHubApiError('Project owner type must be organization or user', 400);
    const result = await this.api.graphql<{ owner: { projectsV2: GitHubPage<GitHubProject> } | null }>(`query($owner:String!,$first:Int!,$after:String){owner:${ownerType}(login:$owner){projectsV2(first:$first,after:$after){nodes{${PROJECT_FIELDS}} pageInfo{hasNextPage endCursor}}}}`, { owner, ...pagination(page) }, signal);
    if (!result.owner) throw new GitHubApiError('GitHub project owner not found', 404);
    return result.owner.projectsV2;
  }

  /** Read project metadata and a page of editable field definitions. */
  async getProject(projectId: string, page: GitHubPageInput = {}, signal?: AbortSignal): Promise<GitHubProject & { fields: GitHubPage<Record<string, unknown>> }> {
    const result = await this.api.graphql<{ node: (GitHubProject & { fields: GitHubPage<Record<string, unknown>> }) | null }>(`query($id:ID!,$first:Int!,$after:String){node(id:$id){... on ProjectV2{${PROJECT_FIELDS} fields(first:$first,after:$after){nodes{... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{options{id name}} ... on ProjectV2IterationField{configuration{iterations{id title startDate duration} completedIterations{id title startDate duration}}}} pageInfo{hasNextPage endCursor}}}}}`, { id: githubNodeId(projectId), ...pagination(page) }, signal);
    if (!result.node?.id) throw new GitHubApiError('GitHub project not found', 404);
    return result.node;
  }

  /** List a page of project items with their first twenty field values. */
  async listItems(projectId: string, page: GitHubPageInput = {}, signal?: AbortSignal): Promise<GitHubPage<GitHubProjectItem>> {
    const result = await this.api.graphql<{ node: { items: GitHubPage<GitHubProjectItem> } | null }>(`query($id:ID!,$first:Int!,$after:String){node(id:$id){... on ProjectV2{items(first:$first,after:$after){nodes{${ITEM_FIELDS} fieldValues(first:20){nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{id name}}} ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2FieldCommon{id name}}} ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2FieldCommon{id name}}} ... on ProjectV2ItemFieldSingleSelectValue{name optionId field{... on ProjectV2FieldCommon{id name}}} ... on ProjectV2ItemFieldIterationValue{title iterationId field{... on ProjectV2FieldCommon{id name}}}} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}}}`, { id: githubNodeId(projectId), ...pagination(page) }, signal);
    if (!result.node?.items) throw new GitHubApiError('GitHub project not found', 404);
    return result.node.items;
  }

  /** Add an existing issue/PR node or create a draft item in the selected project. */
  async addItem(projectId: string, input: { contentId: string } | { title: string; body?: string }, signal?: AbortSignal): Promise<{ id: string }> {
    const project = githubNodeId(projectId);
    if ('contentId' in input) {
      const result = await this.api.graphql<{ addProjectV2ItemById: { item: { id: string } } }>('mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}', { project, content: githubNodeId(input.contentId, 'content ID') }, signal);
      return result.addProjectV2ItemById.item;
    }
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 256 || (input.body !== undefined && (typeof input.body !== 'string' || input.body.length > 65536))) throw new GitHubApiError('Invalid draft title or body', 400);
    const result = await this.api.graphql<{ addProjectV2DraftIssue: { projectItem: { id: string } } }>('mutation($project:ID!,$title:String!,$body:String){addProjectV2DraftIssue(input:{projectId:$project,title:$title,body:$body}){projectItem{id}}}', { project, title: input.title, body: input.body ?? '' }, signal);
    return result.addProjectV2DraftIssue.projectItem;
  }

  /** Set or clear one text, number, date, single-select or iteration field. */
  async updateItemField(projectId: string, itemId: string, fieldId: string, value: GitHubProjectFieldValue, signal?: AbortSignal): Promise<{ id: string }> {
    const variables = { project: githubNodeId(projectId), item: githubNodeId(itemId, 'item ID'), field: githubNodeId(fieldId, 'field ID') };
    if (value === null) {
      const result = await this.api.graphql<{ clearProjectV2ItemFieldValue: { projectV2Item: { id: string } } }>('mutation($project:ID!,$item:ID!,$field:ID!){clearProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field}){projectV2Item{id}}}', variables, signal);
      return result.clearProjectV2ItemFieldValue.projectV2Item;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) throw new GitHubApiError('Supply exactly one supported project field value', 400);
    const [kind, supplied] = Object.entries(value)[0];
    if (kind === 'number' ? typeof supplied !== 'number' || !Number.isFinite(supplied) : kind === 'text' ? typeof supplied !== 'string' || supplied.length > 10000 : kind === 'date' ? typeof supplied !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(supplied) || !Number.isFinite(Date.parse(supplied)) || new Date(supplied).toISOString().slice(0, 10) !== supplied : !['singleSelectOptionId', 'iterationId'].includes(kind) || typeof supplied !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(supplied)) throw new GitHubApiError('Invalid project field value', 400);
    const result = await this.api.graphql<{ updateProjectV2ItemFieldValue: { projectV2Item: { id: string } } }>('mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}){projectV2Item{id}}}', { ...variables, value }, signal);
    return result.updateProjectV2ItemFieldValue.projectV2Item;
  }

  /** Remove a project item without deleting the underlying issue or pull request. */
  async removeItem(projectId: string, itemId: string, signal?: AbortSignal): Promise<{ deletedItemId: string }> {
    const result = await this.api.graphql<{ deleteProjectV2Item: { deletedItemId: string } }>('mutation($project:ID!,$item:ID!){deleteProjectV2Item(input:{projectId:$project,itemId:$item}){deletedItemId}}', { project: githubNodeId(projectId), item: githubNodeId(itemId, 'item ID') }, signal);
    return result.deleteProjectV2Item;
  }
}
