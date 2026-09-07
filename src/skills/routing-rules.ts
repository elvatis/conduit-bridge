import type { ProviderName } from '../types.js';
import { type SkillDefinition } from './index.js';

/** Work classes understood by the model router. */
export type WorkType =
  | 'local' | 'product' | 'architecture' | 'implementation' | 'security'
  | 'review' | 'documentation' | 'research' | 'quick' | 'cost' | 'general';

export interface WorkModelRoute {
  workType: WorkType;
  model: string;
  fallbacks: readonly string[];
  description: string;
}

export interface WorkRoutingRecommendation extends WorkModelRoute {
  provider: ProviderName | 'openrouter-api';
  selectedModel: string;
}

/**
 * Canonical model routes. IDs include their transport so an operator can see
 * which account or local service will answer. Availability is checked later
 * against the live catalog; these defaults remain useful before discovery.
 */
export const WORK_MODEL_ROUTES: Readonly<Record<WorkType, WorkModelRoute>> = {
  local: {
    workType: 'local', model: 'bitnet/auto', fallbacks: ['lmstudio/auto'],
    description: 'Private, offline, classification and extraction work stays local.',
  },
  product: {
    workType: 'product', model: 'api-openrouter/openai/gpt-6-astra',
    fallbacks: ['cli-codex/gpt-5.6-sol', 'cli-claude/claude-fable-5-1', 'cli-claude/claude-opus-5'],
    description: 'Product decisions, reliability work and cross-cutting changes.',
  },
  architecture: {
    workType: 'architecture', model: 'api-openrouter/openai/gpt-6-astra',
    fallbacks: ['cli-claude/claude-opus-5', 'cli-claude/claude-fable-5-1', 'cli-codex/gpt-5.6-sol'],
    description: 'Architecture, design records and difficult tradeoffs.',
  },
  implementation: {
    workType: 'implementation', model: 'cli-codex/gpt-5.6-sol',
    fallbacks: ['api-openrouter/openai/gpt-6-astra', 'cli-claude/claude-fable-5-1', 'cli-claude/claude-fable-5', 'cli-codex/gpt-5.6-terra', 'cli-codex/gpt-5.3-codex-spark', 'cli-codex/gpt-5.5'],
    description: 'Feature implementation, debugging, tests and refactoring.',
  },
  security: {
    workType: 'security', model: 'cli-codex/gpt-daybreak-blue-latest',
    fallbacks: ['api-openrouter/openai/gpt-6-astra', 'cli-codex/gpt-5.6-sol', 'cli-claude/claude-fable-5-1'],
    description: 'Security review, hardening, threat modeling and supply chain checks.',
  },
  review: {
    workType: 'review', model: 'cli-claude/claude-fable-5-1',
    fallbacks: ['cli-claude/claude-opus-5', 'api-openrouter/openai/gpt-6-astra', 'cli-claude/claude-fable-5', 'cli-codex/gpt-5.6-sol'],
    description: 'Independent code, compatibility, evidence and reasoning review.',
  },
  documentation: {
    workType: 'documentation', model: 'cli-claude/claude-fable-5',
    fallbacks: ['cli-claude/claude-fable-5-1', 'cli-claude/claude-sonnet-5', 'cli-codex/gpt-5.6-sol'],
    description: 'README, guides, release notes and other long-form writing.',
  },
  research: {
    workType: 'research', model: 'cli-claude/claude-opus-5',
    fallbacks: ['cli-claude/claude-fable-5', 'cli-claude/claude-fable-5-1', 'api-openrouter/anthropic/claude-opus-5', 'cli-claude/claude-sonnet-5'],
    description: 'Deep investigation and comparison when a web or research tool is authorised.',
  },
  quick: {
    workType: 'quick', model: 'cli-codex/gpt-5.4-mini',
    fallbacks: ['cli-codex/gpt-5.3-codex-spark', 'cli-claude/claude-haiku-4-5'],
    description: 'Short answers, triage, summaries and narrow mechanical edits.',
  },
  cost: {
    workType: 'cost', model: 'cli-codex/gpt-5.6-luna',
    fallbacks: ['cli-codex/gpt-5.4-mini', 'cli-codex/gpt-5.3-codex-spark'],
    description: 'Cost-sensitive work with a smaller, faster reasoning budget.',
  },
  general: {
    workType: 'general', model: 'cli-claude/claude-fable-5',
    fallbacks: ['cli-claude/claude-fable-5-1', 'cli-codex/gpt-5.6-sol', 'cli-claude/claude-sonnet-5', 'api-openrouter/anthropic/claude-sonnet-5'],
    description: 'Balanced everyday conversation, complex reasoning and assistance.',
  },
};

/** Every named route is available to documentation and catalog tests. */
export const WORK_MODEL_IDS = Object.values(WORK_MODEL_ROUTES).flatMap(route => [route.model, ...route.fallbacks]);

/** Classify intent from explicit, stable keywords before selecting a model. */
export function classifyWork(prompt: string): WorkType {
  if (isLocalPrompt(prompt)) return 'local';
  if (/\b(security|secure|hardening|threat|vulnerab|supply[- ]chain|credential|injection|permission)\b/i.test(prompt)) return 'security';
  if (/\b(architecture|architect|design|adr|trade[- ]?off|system design|platform)\b/i.test(prompt)) return 'architecture';
  if (/\b(product|reliability|stability|release readiness|roadmap)\b/i.test(prompt)) return 'product';
  if (/\b(document|documentation|readme|guide|changelog|release notes|write up)\b/i.test(prompt)) return 'documentation';
  if (/\b(review|audit|inspect|verify|compatibility|evidence)\b/i.test(prompt)) return 'review';
  if (/\b(research|search|investigate|compare|recherche)\b/i.test(prompt)) return 'research';
  if (/\b(quick|brief|short|summarize|summary|triage)\b/i.test(prompt)) return 'quick';
  if (/\b(cost|cheap|budget|economical|low[- ]cost)\b/i.test(prompt)) return 'cost';
  if (/\b(code|coding|implement|debug|test|refactor|typescript|python|fix)\b/i.test(prompt)) return 'implementation';
  return 'general';
}

function routeProvider(model: string): ProviderName | 'openrouter-api' {
  if (model.startsWith('api-openrouter/')) return 'openrouter-api';
  return model.slice(0, model.indexOf('/')) as ProviderName;
}

/** Select the first available model while retaining the complete fallback plan. */
export function getWorkRoutingRecommendation(prompt: string, availableModels?: readonly string[]): WorkRoutingRecommendation {
  const route = WORK_MODEL_ROUTES[classifyWork(prompt)];
  const candidates = [route.model, ...route.fallbacks];
  const selectedModel = availableModels?.length
    ? candidates.find(model => availableModels.includes(model)) ?? route.model
    : route.model;
  return { ...route, provider: routeProvider(selectedModel), selectedModel };
}

/** Local-only intent must never fall through to a cloud planner or executor. */
export function isLocalPrompt(prompt: string): boolean {
  return /\b(local|private|offline|classification|extraction|formatting|lokal|privat)\b/i.test(prompt);
}
/** Recommend a provider (model IDs are resolved separately from the provider catalog). */
export function getRoutingRecommendation(prompt: string): ProviderName {
  const recommendation = getWorkRoutingRecommendation(prompt);
  if (recommendation.provider === 'openrouter-api') return 'cli-codex';
  if (recommendation.workType === 'research') return 'gemini-api';
  return recommendation.provider;
}
/** Local routing preference, with an explicit connectivity fallback and no cloud escape. */
export async function selectLocalModel(reachable: (provider: ProviderName) => Promise<boolean>): Promise<string> {
  if (await reachable('lmstudio')) return 'lmstudio/auto';
  if (await reachable('bitnet')) return 'bitnet/auto';
  throw new Error('No local inference provider is reachable');
}
/** Public keyword routing descriptor. */
export const routingRulesSkill: SkillDefinition = {
  name: 'routing-rules', description: 'Recommend a provider from task keywords; private/offline tasks stay local.', effect: 'read',
  schema: { type: 'object', additionalProperties: false, required: ['prompt'], properties: { prompt: { type: 'string', maxLength: 16000 } } },
  async execute(input) {
    const prompt = input.prompt as string;
    const model = getWorkRoutingRecommendation(prompt);
    return { provider: getRoutingRecommendation(prompt), localOnly: isLocalPrompt(prompt), workType: model.workType, model: model.selectedModel, fallbacks: model.fallbacks, description: model.description };
  },
};
