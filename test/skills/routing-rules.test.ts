import { expect, it } from 'vitest';
import { getRoutingRecommendation, getWorkRoutingRecommendation, selectLocalModel, WORK_MODEL_IDS } from '../../src/skills/routing-rules.js';
it('routes local/private workloads before coding or research keywords', () => {
  for (const word of ['local', 'private', 'offline', 'classification', 'extraction', 'formatting']) expect(getRoutingRecommendation(`${word} code research`)).toBe('bitnet');
  expect(getRoutingRecommendation('implement a function')).toBe('cli-codex'); expect(getRoutingRecommendation('research alternatives')).toBe('gemini-api');
});
it('keeps local fallback limited to LM Studio then BitNet', async () => {
  const called: string[] = [];
  expect(await selectLocalModel(async name => { called.push(name); return name === 'bitnet'; })).toBe('bitnet/auto'); expect(called).toEqual(['lmstudio', 'bitnet']);
  await expect(selectLocalModel(async () => false)).rejects.toThrow('No local');
});

it('routes named work classes to the requested model families', () => {
  expect(getWorkRoutingRecommendation('design the product architecture').selectedModel).toBe('api-openrouter/openai/gpt-6-astra');
  expect(getWorkRoutingRecommendation('implement and test the fix').selectedModel).toBe('cli-codex/gpt-5.6-sol');
  expect(getWorkRoutingRecommendation('security hardening and threat review').selectedModel).toBe('cli-codex/gpt-daybreak-blue-latest');
  expect(getWorkRoutingRecommendation('write the README and release notes').selectedModel).toBe('cli-claude/claude-fable-5');
  expect(getWorkRoutingRecommendation('independent analysis and evidence review').selectedModel).toBe('cli-claude/claude-fable-5-1');
  expect(getWorkRoutingRecommendation('everyday complex reasoning').selectedModel).toBe('cli-claude/claude-fable-5');
  expect(getWorkRoutingRecommendation('quickly summarize the error').selectedModel).toBe('cli-codex/gpt-5.4-mini');
  expect(getWorkRoutingRecommendation('use a low-cost model for this task').selectedModel).toBe('cli-codex/gpt-5.6-luna');
});

it('uses an available fallback without losing the route plan', () => {
  const result = getWorkRoutingRecommendation('implement this feature', ['cli-codex/gpt-5.3-codex-spark']);
  expect(result.selectedModel).toBe('cli-codex/gpt-5.3-codex-spark');
  expect(result.fallbacks).toContain('cli-codex/gpt-5.6-terra');
});

it('puts the five strongest requested models on demanding routes', () => {
  expect(getWorkRoutingRecommendation('product reliability decision').selectedModel).toBe('api-openrouter/openai/gpt-6-astra');
  expect(getWorkRoutingRecommendation('implement a difficult refactor').fallbacks).toContain('cli-claude/claude-fable-5-1');
  expect(getWorkRoutingRecommendation('security hardening').selectedModel).toBe('cli-codex/gpt-daybreak-blue-latest');
  expect(getWorkRoutingRecommendation('review this evidence independently').selectedModel).toBe('cli-claude/claude-fable-5-1');
  expect(getWorkRoutingRecommendation('deep research on the tradeoffs').selectedModel).toBe('cli-claude/claude-opus-5');
});

it('keeps every requested named model in the routing catalog', () => {
  for (const id of [
    'api-openrouter/openai/gpt-6-astra', 'cli-codex/gpt-5.6-sol', 'cli-codex/gpt-5.6-terra',
    'cli-codex/gpt-5.6-luna', 'cli-codex/gpt-daybreak-blue-latest', 'cli-codex/gpt-5.5',
    'cli-codex/gpt-5.4-mini', 'cli-codex/gpt-5.3-codex-spark', 'cli-claude/claude-fable-5-1',
    'cli-claude/claude-fable-5', 'cli-claude/claude-opus-5', 'cli-claude/claude-sonnet-5',
    'cli-claude/claude-haiku-4-5',
  ]) expect(WORK_MODEL_IDS).toContain(id);
});
