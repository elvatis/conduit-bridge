import type { ProviderName } from '../types.js';
import { type SkillDefinition } from './index.js';

/** Local-only intent must never fall through to a cloud planner or executor. */
export function isLocalPrompt(prompt: string): boolean {
  return /\b(local|private|offline|classification|extraction|formatting|lokal|privat)\b/i.test(prompt);
}
/** Recommend a provider (model IDs are resolved separately from the provider catalog). */
export function getRoutingRecommendation(prompt: string): ProviderName {
  if (isLocalPrompt(prompt)) return 'bitnet';
  if (/\b(code|coding|implement|debug|test|refactor|typescript|python)\b/i.test(prompt)) return 'cli-codex';
  if (/\b(research|search|investigate|compare|recherche)\b/i.test(prompt)) return 'gemini-api';
  return 'cli-claude';
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
  async execute(input) { const prompt = input.prompt as string; return { provider: getRoutingRecommendation(prompt), localOnly: isLocalPrompt(prompt) }; },
};
