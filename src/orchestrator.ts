import { SkillRegistry, type SkillExecutionContext } from './skills/index.js';
import { RateLimiter } from './rate-limiter.js';
import { PromptSplitter, type SplitStrategy } from './skills/prompt-splitter.js';
import { getRoutingRecommendation, getWorkRoutingRecommendation } from './skills/routing-rules.js';
import { splitExecuteSkill } from './skills/split-execute.js';
import type { NotificationChannel } from './skills/notify.js';

/** Legacy configurable role strategy, retained for existing dashboard clients. */
export type OrchestrationStrategy = 'sequential' | 'parallel' | 'debate';

export interface OrchestrationRole {
  name: string;
  model: string;
}

export interface OrchestratorConfig {
  enabled: boolean;
  strategy: OrchestrationStrategy;
  roles: OrchestrationRole[];
  fallbackModels: string[];
}

export const DEFAULT_ORCHESTRATOR: OrchestratorConfig = {
  enabled: false,
  strategy: 'sequential',
  roles: [
    { name: 'Analyst', model: '' },
    { name: 'Reviewer', model: '' },
    { name: 'Synthesizer', model: '' },
  ],
  fallbackModels: [],
};

/** Execution settings use host-provided authorization context, never caller-supplied credentials. */
export interface OrchestrateOptions { context: SkillExecutionContext; strategy?: SplitStrategy; execute?: boolean; channel?: NotificationChannel }
/** Split a prompt, optionally execute the plan, and return per-task outcomes. Preview is the default. */
export async function orchestrate(prompt: string, options: OrchestrateOptions): Promise<unknown> {
  const context = { ...options.context, rateLimiter: options.context.rateLimiter ?? new RateLimiter() };
  const plan = await new PromptSplitter(context).split(prompt, options.strategy);
  const recommendation = getRoutingRecommendation(prompt);
  const modelRecommendation = getWorkRoutingRecommendation(prompt);
  if (!options.execute) return { ...plan, recommendation, modelRecommendation };
  const skills = new SkillRegistry([splitExecuteSkill]);
  const execution = await skills.execute('split-execute', { tasks: plan.tasks, channel: options.channel ?? 'log' }, context);
  return { ...plan, recommendation, modelRecommendation, execution };
}
