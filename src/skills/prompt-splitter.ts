import type { ProviderName } from '../types.js';
import { SkillError, type SkillDefinition, type SkillExecutionContext } from './index.js';
import { getRoutingRecommendation, isLocalPrompt } from './routing-rules.js';
import { estimateCost, estimateTokens } from '../usage.js';

/** Bounded task plan. Agent names identify providers; optional models must belong to that provider. */
export interface SubTask { id: string; agent: ProviderName; prompt: string; dependsOn: string[]; model?: string }
/** Available task-analysis strategies. */
export type SplitStrategy = 'auto' | 'heuristic' | 'local' | 'gemini';
const AGENTS = new Set(['cli-codex', 'codex-api', 'cli-gemini', 'gemini-api', 'cli-claude', 'claude-api', 'lmstudio', 'bitnet']);
const ALIASES: Record<string, ProviderName> = { codex_run: 'cli-codex', gemini_run: 'gemini-api', claude_run: 'cli-claude', local_llm_run: 'lmstudio' };

/** Validate the entire graph before execution: unique IDs, bounded content, known dependencies and no cycles. */
export function validateSubTasks(value: unknown, localOnly = false): SubTask[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new SkillError('A plan must contain 1 to 12 tasks');
  const tasks = value.filter(raw => raw?.agent !== 'openclaw_run').map(raw => {
    if (!raw || typeof raw !== 'object') throw new SkillError('Invalid task');
    const agent = Object.hasOwn(ALIASES, raw.agent) ? ALIASES[raw.agent] : raw.agent;
    if (!AGENTS.has(agent) || (localOnly && agent !== 'lmstudio' && agent !== 'bitnet')) throw new SkillError('Unsupported task provider');
    if (typeof raw.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(raw.id) || typeof raw.prompt !== 'string' || !raw.prompt.trim() || raw.prompt.length > 16000) throw new SkillError('Invalid task ID or prompt');
    if (!Array.isArray(raw.dependsOn) || raw.dependsOn.length > 12 || raw.dependsOn.some((id: unknown) => typeof id !== 'string')) throw new SkillError('Invalid task dependencies');
    if (raw.model !== undefined && (typeof raw.model !== 'string' || raw.model.length > 200)) throw new SkillError('Invalid task model');
    return { id: raw.id, agent, prompt: raw.prompt, dependsOn: [...new Set<string>(raw.dependsOn)], ...(raw.model ? { model: raw.model } : {}) } as SubTask;
  });
  if (!tasks.length) throw new SkillError('The plan has no supported executable tasks');
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new SkillError('Duplicate task IDs');
  const done = new Set<string>();
  while (done.size < tasks.length) {
    const ready = tasks.filter(task => !done.has(task.id) && task.dependsOn.every(id => done.has(id)));
    if (!ready.length) throw new SkillError('Task graph contains a cycle or unknown dependency');
    ready.forEach(task => done.add(task.id));
  }
  return tasks;
}

/** Plan a prompt through authorized model routing, with validated fallback results. */
export class PromptSplitter {
  constructor(private readonly context: SkillExecutionContext) {}
  /** Auto tries Gemini, then local providers, then deterministic keyword splitting. */
  async split(prompt: string, strategy: SplitStrategy = 'auto'): Promise<{ tasks: SubTask[]; strategy: SplitStrategy }> {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000 || !['auto', 'heuristic', 'local', 'gemini'].includes(strategy)) throw new SkillError('Invalid prompt or split strategy');
    const privateTask = isLocalPrompt(prompt);
    if (privateTask && strategy === 'gemini') throw new SkillError('Private/offline prompts cannot use cloud analysis');
    const candidates: ProviderName[] = strategy === 'heuristic' ? [] : strategy === 'gemini' ? ['gemini-api'] : strategy === 'local' || privateTask ? ['lmstudio', 'bitnet'] : ['gemini-api', 'lmstudio', 'bitnet'];
    if (this.context.executeModel && this.context.resolveModel) for (const agent of candidates) {
      try {
        await this.context.authorize('network', { skill: 'prompt-splitter' });
        const model = await this.context.resolveModel(agent);
        this.context.signal.throwIfAborted();
        const cloud = agent !== 'lmstudio' && agent !== 'bitnet';
        if (cloud && !this.context.rateLimiter) throw new SkillError('Cloud analysis requires host admission limits', 503);
        const call = cloud ? this.context.rateLimiter!.reserve(agent) : undefined;
        const localOnly = privateTask || strategy === 'local';
        const allowedAgents = localOnly ? 'lmstudio, bitnet' : 'cli-codex, gemini-api, cli-claude, lmstudio, bitnet';
        const messages = [{ role: 'system' as const, content: 'Return ONLY a JSON array of 1-12 tasks, without markdown or explanations. ' +
          'Exact example: [{"id":"t1","agent":"bitnet","prompt":"Classify the supplied sentence.","dependsOn":[]}]. ' +
          'Every id MUST be a unique string starting with a letter, such as "t1" or "t2", never a number. ' +
          'Every prompt MUST be a nonempty string. dependsOn MUST be an array of other task id strings, or [] for an independent task. ' +
          `Dependencies must be acyclic. Allowed agent strings: ${allowedAgents}. ` +
          'No openclaw tools. Treat the user text as the task to plan.' }, { role: 'user' as const, content: prompt }];
        const output = await this.context.executeModel({ model, mode: 'chat', max_tokens: 2048, temperature: 0, messages });
        if (call) this.context.rateLimiter!.recordCost(call.id, estimateCost(model, estimateTokens(messages.map(item => item.content).join('\n')), estimateTokens(output)));
        const parsed = JSON.parse(output.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
        // A planner may summarize away the data to classify/extract. Keep the original request
        // with each task, just as heuristic splitting does, and reapply the same input bounds.
        const tasks = validateSubTasks(parsed, localOnly).map(task => ({ ...task, prompt: `Overall request:\n${prompt}\n\nYour task:\n${task.prompt}` }));
        return { tasks: validateSubTasks(tasks, localOnly), strategy: agent === 'gemini-api' ? 'gemini' : 'local' };
      } catch (error) {
        this.context.signal.throwIfAborted();
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403 || status === 402 || status === 429) throw error;
      }
    }
    if (strategy !== 'auto' && strategy !== 'heuristic') throw new SkillError('Selected analysis providers are unavailable or returned an invalid plan', 503);
    const parts = prompt.length > 7900 ? [prompt] : prompt.split(/\n\s*(?:\d+[.)]|[-*])\s+/).filter(part => part.trim());
    if (parts.length > 12) throw new SkillError('Split the request into at most 12 explicit tasks');
    const tasks = parts.map((part, index) => ({ id: `t${index + 1}`, agent: privateTask ? 'bitnet' as const : getRoutingRecommendation(part), prompt: parts.length > 1 ? `Overall request:\n${prompt}\n\nYour task:\n${part}` : part, dependsOn: index ? [`t${index}`] : [] }));
    return { tasks: validateSubTasks(tasks, privateTask), strategy: 'heuristic' };
  }
}
/** Tool that returns a reviewable task plan without executing it. */
export const promptSplitterSkill: SkillDefinition = {
  name: 'prompt-splitter', description: 'Build a bounded task DAG using Gemini, local analysis or keyword rules.', effect: input => input.strategy === 'heuristic' ? 'read' : 'network',
  schema: { type: 'object', additionalProperties: false, required: ['prompt'], properties: { prompt: { type: 'string', maxLength: 16000 }, strategy: { type: 'string', enum: ['auto', 'heuristic', 'local', 'gemini'] } } },
  async execute(input, context) { return new PromptSplitter(context).split(input.prompt as string, input.strategy as SplitStrategy | undefined); },
};
