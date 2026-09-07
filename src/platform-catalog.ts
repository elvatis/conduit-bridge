import { randomUUID } from 'node:crypto';
import type { StateStore, StateTransaction } from './storage.js';
import { KNOWN_TOOLS } from './cli-mode.js';

export type CatalogMode = 'chat' | 'plan' | 'agent';
export interface CatalogReference { id: string; version: number; }
export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  version: number;
  body: string;
  requiredTools: string[];
  modes: CatalogMode[];
  tags: string[];
  builtIn: boolean;
  createdAt: number;
}
export interface CatalogInput {
  id?: string;
  name: string;
  description?: string;
  body: string;
  requiredTools?: string[];
  modes?: CatalogMode[];
  tags?: string[];
  expectedVersion?: number;
}
export interface PlatformAgent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  provider?: string;
  model?: string;
  profileId?: string;
  mode: CatalogMode;
  skillRefs: CatalogReference[];
  promptRefs: CatalogReference[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface AgentInput {
  id?: string;
  name: string;
  description?: string;
  instructions?: string;
  provider?: string;
  model?: string;
  profileId?: string;
  mode?: CatalogMode;
  skillRefs?: CatalogReference[];
  promptRefs?: CatalogReference[];
  expectedRevision?: number;
}
export class CatalogError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'invalid_catalog') { super(message); }
}
function string(value: unknown, name: string, maximum: number, required = true): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) || value.includes('\0')) throw new CatalogError(`${name} must be ${required ? 'nonempty ' : ''}text of at most ${maximum} characters`);
  return value;
}
function id(value: unknown): string {
  const result = string(value, 'id', 100);
  if (!/^[a-zA-Z0-9][\w-]*$/.test(result) || ['constructor', 'prototype'].includes(result)) throw new CatalogError('Catalog ID must be a safe identifier');
  return result;
}
function modes(value: unknown): CatalogMode[] {
  if (!Array.isArray(value) || !value.length || value.length > 3 || value.some(item => !['chat', 'plan', 'agent'].includes(item))) throw new CatalogError('Select at least one supported mode');
  return [...new Set(value)] as CatalogMode[];
}
function refs(value: unknown): CatalogReference[] {
  if (!Array.isArray(value) || value.length > 20) throw new CatalogError('Attach at most 20 pinned catalog versions');
  const result = value.map(reference => {
    if (!reference || typeof reference !== 'object' || !Number.isSafeInteger(reference.version) || reference.version < 1) throw new CatalogError('Every attachment must pin a positive integer version');
    return { id: id(reference.id), version: reference.version };
  });
  if (new Set(result.map(item => item.id)).size !== result.length) throw new CatalogError('A catalog item cannot be attached twice');
  return result;
}
const SKILLS = 'platform.skills';
const PROMPTS = 'platform.prompts';
const AGENTS = 'platform.agents';
const ARCHIVED = 'platform.catalog-archived';
type Reader = Pick<StateTransaction, 'read' | 'list'>;

function builtin(entryId: string, name: string, description: string, body: string, tags: string[], requiredTools: string[] = [], supported: CatalogMode[] = ['chat', 'plan', 'agent']): CatalogEntry {
  return { id: entryId, name, description, body, tags, requiredTools, modes: supported, version: 1, builtIn: true, createdAt: 0 };
}

/** Versioned instructions. They do not install tools or grant execution permission. */
export const BUILTIN_SKILLS: CatalogEntry[] = [
  builtin('requirements-and-acceptance', 'Requirements and acceptance', 'Turn a request into measurable behavior and verification.', 'Identify the user-visible goal, constraints and open assumptions. Write observable acceptance criteria and a minimal verification plan. Preserve explicit requirements. Separate confirmed facts from assumptions. Finish with implementation order and concrete completion evidence.', ['planning', 'acceptance']),
  builtin('workspace-orientation', 'Workspace orientation', 'Map an existing repository before proposing changes.', 'Inspect repository instructions, entry points, build/test commands and relevant dependencies. Identify the smallest set of modules involved in the task. Report exact paths and observed contracts. Do not claim a file or command was inspected unless a tool returned its contents or result.', ['repository', 'architecture'], ['Read', 'FileSearch']),
  builtin('minimal-implementation', 'Minimal implementation', 'Make a focused change that satisfies the stated requirements.', 'Implement the agreed behavior in the smallest coherent change. Preserve unrelated edits and existing public contracts. Add error handling where a new failure can occur. Run the relevant checks and report files changed, validation results and remaining limitations. Do not expand scope based on speculative improvements.', ['coding', 'implementation'], ['Read', 'Edit'], ['agent']),
  builtin('defect-reproduction', 'Defect reproduction', 'Derive a minimal reproduction before selecting a fix.', 'State the trigger, expected behavior and observed failure. Trace the relevant code path, isolate the smallest reproducible input, and distinguish root cause from symptom. Propose a regression check that fails before the fix and passes afterward. Label unverified hypotheses.', ['debugging', 'reliability']),
  builtin('independent-code-review', 'Independent code review', 'Review supplied changes against requirements and evidence.', 'Evaluate the actual diff, original request and test evidence independently of the implementation narrative. Prioritize reproducible defects, regressions and missing failure handling. For each finding include severity, location, trigger, impact and a focused fix. Do not invent findings to fill a quota; distinguish suggestions from defects.', ['review', 'quality']),
  builtin('regression-tests', 'Regression test design', 'Select tests that protect behavior rather than mirror code.', 'Derive tests from observable contracts. Cover the changed happy path, failure path and boundary conditions; include concurrency or cancellation when behavior depends on them. Prefer deterministic fakes for remote providers. Explain what each test detects and avoid assertions that merely reproduce implementation details.', ['testing', 'reliability']),
  builtin('api-contracts', 'API contract review', 'Inspect compatibility, validation and lifecycle semantics.', 'Inspect request/response shapes, status codes, validation, pagination, streaming termination, cancellation and idempotency. Identify compatibility changes with concrete before/after examples. Recommend contract tests for clients and server implementations. Distinguish transport failures from application outcomes.', ['api', 'compatibility']),
  builtin('accessible-responsive-ui', 'Accessible responsive UI', 'Evaluate responsive interaction and keyboard usability.', 'Evaluate the supplied UI at narrow and wide widths, keyboard-only navigation, visible focus, labeled inputs, loading and error states, and long content. Propose concrete CSS/interaction fixes and observable checks. Preserve edits during background refresh and make primary actions usable without hover.', ['ui', 'accessibility', 'responsive']),
  builtin('observability-and-statistics', 'Observability and statistics', 'Define meaningful operational measurements.', 'Define request, attempt, run and completion separately. Separate estimates from provider-reported usage. Inspect denominator, time window, retention and missing-data behavior of every statistic. Recommend structured correlation fields and actionable error context. Include tests for retries, partial failures and concurrent requests.', ['statistics', 'logging']),
  builtin('performance-analysis', 'Performance analysis', 'Identify measured bottlenecks and bounded improvements.', 'Trace the workload and identify blocking I/O, repeated work, unbounded collections and excessive concurrency. Start with measurements or a repeatable benchmark. Estimate improvement and tradeoffs, preserve correctness, and recommend bounded caches or queues only where evidence supports them.', ['performance', 'architecture']),
  builtin('documentation-evidence', 'Documentation against evidence', 'Write documentation that matches the implemented behavior.', 'Use actual code, command output and API examples as sources. Explain setup, ordinary usage, failure recovery and limits in plain language. Mark examples that use mock data. Check names and commands for consistency. Do not describe planned features as implemented.', ['documentation', 'review']),
  builtin('release-readiness', 'Release readiness', 'Assemble a release decision from verified results.', 'Compare the release scope with acceptance criteria, test/build results, migrations and rollback instructions. Enumerate known limitations and required operator actions. Produce a concise decision supported by evidence. A model recommendation does not itself authorize deployment or publication.', ['release', 'verification']),
];

export const BUILTIN_PROMPTS: CatalogEntry[] = [
  builtin('feature-plan', 'Feature plan', 'Acceptance criteria, design and verification for a new feature.', 'For the task below, produce: intended behavior; acceptance criteria; affected components; implementation steps; focused tests; assumptions requiring evidence. Keep the design compatible with the existing system. Do not implement yet.', ['coding', 'planning'], [], ['chat', 'plan']),
  builtin('feature-implementation', 'Feature implementation', 'Implement an approved plan and collect real checks.', 'Implement the task using the approved plan and repository instructions. Preserve unrelated changes. Run relevant tests and build checks. Return changed files, actual command results, acceptance criteria met and any incomplete work. Never substitute a claimed success for command evidence.', ['coding'], ['Read', 'Edit'], ['agent']),
  builtin('change-review', 'Change review', 'Review an actual diff with the original request and test results.', 'Review the supplied original task, diff and test output. List only actionable defects with severity, file/line, triggering input and impact. Then identify missing verification and optional design improvements separately. If no defect is supported by evidence, say so.', ['review']),
  builtin('bounded-repair', 'Bounded repair', 'Repair the reported defects without broadening scope.', 'Address only the supplied failed acceptance checks or review findings. For each, identify its cause, apply a minimal correction and rerun its verification. Return the new evidence and unresolved findings. Respect the caller-provided iteration, time and cost limits; do not start an open-ended loop.', ['coding', 'repair'], ['Read', 'Edit'], ['agent']),
  builtin('bugfix-reproduction', 'Bug reproduction and fix plan', 'Explain a failure and specify a focused regression.', 'Given the bug report and code, construct the smallest reproduction, expected versus actual behavior, root cause and minimal fix plan. Specify the regression that would have detected it. Clearly identify any missing input or unexecuted check.', ['debugging'], [], ['chat', 'plan']),
  builtin('architecture-debate', 'Architecture debate', 'Compare viable alternatives against explicit criteria.', 'Analyze the proposed design independently. Compare at most three viable alternatives by correctness, operational complexity, maintainability and cost. State assumptions and evidence. Include one concrete failure scenario per option and recommend an option with measurable acceptance criteria.', ['architecture', 'debate']),
  builtin('debate-synthesis', 'Debate synthesis', 'Resolve disagreements using evidence and constraints.', 'Synthesize the supplied independent analyses against the original task. Identify agreements, unresolved factual disagreements and evidence needed to settle them. Choose a design only when its tradeoffs satisfy the constraints. Preserve dissenting risks instead of averaging incompatible claims.', ['architecture', 'synthesis']),
  builtin('documentation-release', 'Documentation and release notes', 'Produce user-facing notes from verified changes.', 'Write concise documentation and release notes from the actual implementation and validation evidence. Describe changed behavior, setup or migration steps, examples, known limits and rollback. Separate completed behavior from future ideas.', ['documentation', 'release']),
];

export class PlatformCatalogService {
  constructor(private readonly store: StateStore, private readonly now: () => number = Date.now) {}
  private builtins(collection: string): CatalogEntry[] { return collection === SKILLS ? BUILTIN_SKILLS : BUILTIN_PROMPTS; }
  private archived(collection: string, entryId: string, reader: Reader = this.store): boolean { return !!reader.read(ARCHIVED, `${collection}:${entryId}`); }
  private allVersions(collection: string, reader: Reader = this.store): CatalogEntry[] {
    return [...this.builtins(collection), ...reader.list<CatalogEntry>(collection)];
  }
  private getEntry(collection: string, entryId: string, version?: number, reader: Reader = this.store): CatalogEntry | undefined {
    if (this.archived(collection, entryId, reader)) return undefined;
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) throw new CatalogError('Invalid catalog version');
    const entry = this.allVersions(collection, reader).filter(item => item.id === entryId && (version === undefined || item.version === version)).sort((a, b) => b.version - a.version)[0];
    return entry ? structuredClone(entry) : undefined;
  }
  private listEntries(collection: string): CatalogEntry[] {
    const ids = new Set(this.allVersions(collection).map(item => item.id));
    return [...ids].map(entryId => this.getEntry(collection, entryId)).filter((entry): entry is CatalogEntry => !!entry).sort((a, b) => a.name.localeCompare(b.name));
  }
  listSkills(): CatalogEntry[] { return this.listEntries(SKILLS); }
  getSkill(entryId: string, version?: number): CatalogEntry | undefined { return this.getEntry(SKILLS, entryId, version); }
  listPrompts(): CatalogEntry[] { return this.listEntries(PROMPTS); }
  getPrompt(entryId: string, version?: number): CatalogEntry | undefined { return this.getEntry(PROMPTS, entryId, version); }
  listSkillVersions(entryId: string): CatalogEntry[] { return this.allVersions(SKILLS).filter(item => item.id === entryId).sort((a, b) => b.version - a.version).map(item => structuredClone(item)); }
  listPromptVersions(entryId: string): CatalogEntry[] { return this.allVersions(PROMPTS).filter(item => item.id === entryId).sort((a, b) => b.version - a.version).map(item => structuredClone(item)); }
  async saveSkill(input: CatalogInput): Promise<CatalogEntry> { return this.saveEntry(SKILLS, input); }
  async savePrompt(input: CatalogInput): Promise<CatalogEntry> { return this.saveEntry(PROMPTS, input); }
  private async saveEntry(collection: string, input: CatalogInput): Promise<CatalogEntry> {
    const entryId = id(input.id || `custom-${randomUUID()}`);
    const name = string(input.name, 'name', 200);
    const description = string(input.description || '', 'description', 2000, false);
    const body = string(input.body, 'body', 20000);
    const supported = modes(input.modes || ['chat', 'plan', 'agent']);
    const tools = input.requiredTools || [];
    const known = new Set(KNOWN_TOOLS.map(tool => tool.name));
    if (!Array.isArray(tools) || tools.length > 30 || tools.some(tool => typeof tool !== 'string' || !known.has(tool))) throw new CatalogError('requiredTools must name known bridge tools');
    const tags = input.tags || [];
    if (!Array.isArray(tags) || tags.length > 20) throw new CatalogError('Use at most 20 tags');
    tags.forEach(tag => string(tag, 'tag', 60));
    return this.store.transaction(tx => {
      const latest = this.allVersions(collection, tx).filter(item => item.id === entryId).sort((a, b) => b.version - a.version)[0];
      if (input.expectedVersion !== undefined && input.expectedVersion !== (latest?.version || 0)) throw new CatalogError('Catalog version changed; reload before saving', 409, 'version_conflict');
      const entry: CatalogEntry = { id: entryId, name, description, body, modes: supported, requiredTools: [...new Set(tools)], tags: [...new Set(tags)], version: (latest?.version || 0) + 1, builtIn: false, createdAt: this.now() };
      tx.put(collection, `${entryId}@${entry.version}`, entry);
      tx.delete(ARCHIVED, `${collection}:${entryId}`);
      return structuredClone(entry);
    });
  }
  async deleteSkill(entryId: string): Promise<boolean> { return this.archiveEntry(SKILLS, entryId); }
  async deletePrompt(entryId: string): Promise<boolean> { return this.archiveEntry(PROMPTS, entryId); }
  private async archiveEntry(collection: string, entryId: string): Promise<boolean> {
    id(entryId);
    return this.store.transaction(tx => {
      if (!this.getEntry(collection, entryId, undefined, tx)) return false;
      tx.put(ARCHIVED, `${collection}:${entryId}`, { archivedAt: this.now() });
      return true;
    });
  }
  listAgents(): PlatformAgent[] { return this.store.list<PlatformAgent>(AGENTS).sort((a, b) => a.name.localeCompare(b.name)).map(agent => structuredClone(agent)); }
  getAgent(agentId: string): PlatformAgent | undefined { const agent = this.store.read<PlatformAgent>(AGENTS, agentId); return agent ? structuredClone(agent) : undefined; }
  private resolveReferences(collection: string, references: CatalogReference[], reader: Reader = this.store): CatalogEntry[] {
    return references.map(reference => {
      const entry = this.getEntry(collection, reference.id, reference.version, reader);
      if (!entry) throw new CatalogError(`Pinned ${collection === SKILLS ? 'skill' : 'prompt'} ${reference.id}@${reference.version} is missing or archived`, 409, 'missing_attachment');
      return entry;
    });
  }
  async saveAgent(input: AgentInput): Promise<PlatformAgent> {
    const agentId = id(input.id || `agent-${randomUUID()}`);
    const name = string(input.name, 'name', 200);
    const description = string(input.description || '', 'description', 2000, false);
    const instructions = string(input.instructions || '', 'instructions', 20000, false);
    const mode = modes([input.mode || 'chat'])[0];
    const skillRefs = refs(input.skillRefs || []);
    const promptRefs = refs(input.promptRefs || []);
    for (const [key, value] of Object.entries({ provider: input.provider, model: input.model, profileId: input.profileId })) if (value !== undefined) string(value, key, 300);
    return this.store.transaction(tx => {
      const previous = tx.read<PlatformAgent>(AGENTS, agentId);
      if (input.expectedRevision !== undefined && input.expectedRevision !== (previous?.revision || 0)) throw new CatalogError('Agent changed; reload before saving', 409, 'revision_conflict');
      const entries = [...this.resolveReferences(SKILLS, skillRefs, tx), ...this.resolveReferences(PROMPTS, promptRefs, tx)];
      if (entries.some(entry => !entry.modes.includes(mode))) throw new CatalogError(`An attachment does not support ${mode} mode`, 409, 'mode_mismatch');
      const agent: PlatformAgent = { id: agentId, name, description, instructions, mode, provider: input.provider, model: input.model, profileId: input.profileId, skillRefs, promptRefs, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt ?? this.now(), updatedAt: this.now() };
      tx.put(AGENTS, agentId, agent);
      return structuredClone(agent);
    });
  }
  async deleteAgent(agentId: string): Promise<boolean> { return this.store.transaction(tx => tx.delete(AGENTS, agentId)); }
  resolveAgent(agentId: string, options: { provider?: string; mode?: CatalogMode; availableTools?: string[] } = {}): { agent: PlatformAgent; instructions: string; skills: CatalogEntry[]; prompts: CatalogEntry[]; requiredTools: string[] } {
    const agent = this.getAgent(agentId);
    if (!agent) throw new CatalogError('Agent not found', 404, 'not_found');
    if (agent.provider && options.provider && agent.provider !== options.provider) throw new CatalogError(`Agent is pinned to provider ${agent.provider}`, 409, 'provider_mismatch');
    const mode = options.mode || agent.mode;
    const skills = this.resolveReferences(SKILLS, agent.skillRefs);
    const prompts = this.resolveReferences(PROMPTS, agent.promptRefs);
    const entries = [...skills, ...prompts];
    if (entries.some(entry => !entry.modes.includes(mode))) throw new CatalogError(`An attachment does not support ${mode} mode`, 409, 'mode_mismatch');
    const requiredTools = [...new Set(entries.flatMap(entry => entry.requiredTools))];
    const available = new Set(options.availableTools || []);
    const missing = requiredTools.filter(tool => !available.has(tool));
    if (missing.length) throw new CatalogError(`Attached instructions require unavailable tools: ${missing.join(', ')}`, 409, 'tool_mismatch');
    const instructions = [agent.instructions, ...entries.map(entry => `Attached ${entry.name} (${entry.id}@${entry.version}):\n${entry.body}`)].filter(Boolean).join('\n\n');
    if (instructions.length > 60000) throw new CatalogError('Combined agent instructions exceed 60000 characters', 413, 'context_limit');
    return { agent, instructions, skills, prompts, requiredTools };
  }
}
