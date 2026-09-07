import { expect, it } from 'vitest';
import { getRoutingRecommendation, selectLocalModel } from '../../src/skills/routing-rules.js';
it('routes local/private workloads before coding or research keywords', () => {
  for (const word of ['local', 'private', 'offline', 'classification', 'extraction', 'formatting']) expect(getRoutingRecommendation(`${word} code research`)).toBe('bitnet');
  expect(getRoutingRecommendation('implement a function')).toBe('cli-codex'); expect(getRoutingRecommendation('research alternatives')).toBe('gemini-api');
});
it('keeps local fallback limited to LM Studio then BitNet', async () => {
  const called: string[] = [];
  expect(await selectLocalModel(async name => { called.push(name); return name === 'bitnet'; })).toBe('bitnet/auto'); expect(called).toEqual(['lmstudio', 'bitnet']);
  await expect(selectLocalModel(async () => false)).rejects.toThrow('No local');
});
