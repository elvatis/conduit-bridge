import { describe, expect, it } from 'vitest';
import { buildCodingPipelines } from '../src/platform-presets.js';
import { validatePipeline, interpolatePrompt } from '../src/pipelines.js';

describe('installable coding pipeline presets', () => {
  const models = { planner: 'provider/planner', implementer: 'provider/implementer', reviewer: 'provider/reviewer', security: 'provider/security' };
  it('builds five validated DAGs from supplied role models and carries the original request in every step', () => {
    const pipelines = buildCodingPipelines(models);
    expect(pipelines).toHaveLength(5);
    expect(new Set(pipelines.map(pipeline => pipeline.id)).size).toBe(5);
    for (const pipeline of pipelines) {
      expect(() => validatePipeline(pipeline)).not.toThrow();
      for (const step of pipeline.steps) {
        expect(Object.values(models)).toContain(step.model);
        expect(interpolatePrompt(step.promptTemplate, 'Original requirement marker', {}, step.dependsOn)).toContain('Original requirement marker');
        expect(step.promptTemplate).toContain('actual source/diff/test artifacts');
        expect(step.promptTemplate).toContain('{{prior_steps}}');
      }
    }
  });
  it('gates every implementation and uses agent mode only for implementation', () => {
    for (const pipeline of buildCodingPipelines(models)) {
      for (const step of pipeline.steps.filter(step => step.mode === 'agent')) {
        expect(step.id).toBe('implement');
        expect(step.requiresApproval).toBe(true);
        expect(step.model).toBe(models.implementer);
      }
      const last = pipeline.steps.at(-1)!;
      expect(last.requiresApproval).toBe(true);
      expect(last.dependsOn!.length).toBeGreaterThan(0);
    }
  });
  it('routes security exclusively to the supplied security model and rejects missing role models', () => {
    for (const pipeline of buildCodingPipelines(models)) for (const step of pipeline.steps.filter(step => step.id === 'security')) expect(step.model).toBe(models.security);
    expect(() => buildCodingPipelines({ ...models, security: '' })).toThrow('required');
  });
});
