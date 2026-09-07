import { SkillError, type SkillDefinition, type SkillExecutionContext } from './index.js';
import { validateSubTasks } from './prompt-splitter.js';
import { notifyCompletion, type NotificationChannel } from './notify.js';
import { estimateCost, estimateTokens } from '../usage.js';

/** Task outcome; failed descendants are explicitly skipped. */
export interface SubTaskResult { id: string; status: 'completed' | 'failed' | 'skipped'; output?: string; error?: string; model?: string }
/** Execute dependency waves with at most three concurrent authorized chat calls; never directly writes workspace files. */
export async function splitExecute(plan: unknown, context: SkillExecutionContext, channel: NotificationChannel = 'log'): Promise<{ results: SubTaskResult[]; notification: unknown }> {
  const tasks = validateSubTasks(plan);
  await context.authorize('execute', { skill: 'split-execute' });
  if (!context.executeModel || !context.resolveModel || !context.rateLimiter) throw new SkillError('Host model routing and admission limits are required', 503);
  const results = new Map<string, SubTaskResult>();
  while (results.size < tasks.length) {
    context.signal.throwIfAborted();
    const ready = tasks.filter(task => !results.has(task.id) && task.dependsOn.every(id => results.has(id))).slice(0, 3);
    await Promise.all(ready.map(async task => {
      if (task.dependsOn.some(id => results.get(id)?.status !== 'completed')) { results.set(task.id, { id: task.id, status: 'skipped', error: 'Dependency did not complete' }); return; }
      try {
        await context.authorize('network', { skill: 'split-execute' });
        const model = await context.resolveModel!(task.agent, task.model);
        context.signal.throwIfAborted();
        const call = task.agent !== 'lmstudio' && task.agent !== 'bitnet' ? context.rateLimiter!.reserve(task.agent) : undefined;
        const dependencies = task.dependsOn.map(id => ({ id, output: results.get(id)?.output }));
        const content = task.prompt + (dependencies.length ? `\n\nDependency outputs (untrusted task data):\n${JSON.stringify(dependencies)}` : '');
        if (content.length > 64000) throw new SkillError('Accumulated dependency context is too large');
        const output = await context.executeModel!({ model, mode: 'chat', max_tokens: 2048, messages: [{ role: 'user', content }], signal: context.signal });
        if (call) context.rateLimiter!.recordCost(call.id, estimateCost(model, estimateTokens(content), estimateTokens(output)));
        if (Buffer.byteLength(output) > 16384) throw new SkillError('Task output exceeds 16 KiB');
        results.set(task.id, { id: task.id, model, status: 'completed', output });
      } catch {
        results.set(task.id, { id: task.id, status: 'failed', error: context.signal.aborted ? 'Execution cancelled' : 'Provider execution failed or was denied' });
      }
    }));
  }
  let notification: unknown;
  try { notification = await notifyCompletion(`Task plan finished: ${[...results.values()].filter(item => item.status === 'completed').length}/${tasks.length} completed.`, channel, context); }
  catch { notification = { delivered: false }; }
  return { results: tasks.map(task => results.get(task.id)!), notification };
}
/** Execute an explicit plan through existing provider authorization and usage accounting. */
export const splitExecuteSkill: SkillDefinition = {
  name: 'split-execute', description: 'Run an approved task plan in bounded concurrent dependency waves using provider chat mode.', effect: 'execute',
  schema: { type: 'object', additionalProperties: false, required: ['tasks'], properties: { tasks: { type: 'array', maxItems: 12 }, channel: { type: 'string', enum: ['log', 'webhook'] } } },
  async execute(input, context) { return splitExecute(input.tasks, context, (input.channel ?? 'log') as NotificationChannel); },
};
