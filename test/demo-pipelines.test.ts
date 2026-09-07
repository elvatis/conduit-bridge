import { describe, expect, it } from 'vitest';
import { loadDefinitions, parseOptions, validateCompletedExample } from '../scripts/demo-pipelines.mjs';

describe('community pipeline examples', () => {
  it('requires intentional model selection and a credential-free local origin', () => {
    expect(() => parseOptions([])).toThrow('explicit --model');
    expect(() => parseOptions(['--model', 'cli-codex/test', '--base-url', 'https://remote.example'])).toThrow('loopback');
    expect(() => parseOptions(['--model', 'cli-codex/test', '--base-url', 'http://secret@localhost:31338'])).toThrow('loopback');
    expect(() => parseOptions(['--model', 'api-codex/test'])).toThrow('filesystem tools');
    expect(() => parseOptions(['--model', 'cli-codex/test'])).toThrow('--allow-write-demo');
    expect(parseOptions(['--model', 'api-codex/test', '--case', 'community-debate']).peerModel).toBe('api-codex/test');
  });

  it('instantiates three distinct examples without altering prompt interpolation', async () => {
    const options = parseOptions(['--model', 'cli-codex/primary', '--peer-model', 'cli-claude/peer', '--allow-write-demo']);
    const examples = await loadDefinitions(options, 'test-suffix');
    expect(new Set(examples.map(example => example.id)).size).toBe(3);
    expect(examples[0].steps.map(step => step.model)).toEqual(['cli-codex/primary', 'cli-claude/peer']);
    expect(examples[1].steps[1].requiresApproval).toBe(true);
    expect(examples[2].steps[2].dependsOn).toEqual(['quickstart', 'architecture']);
    expect(examples[2].steps[2].promptTemplate).toContain('{{prior_steps}}');
  });

  it('refuses a completed label when an approval step never executed', () => {
    expect(() => validateCompletedExample('community-approval', {
      sawApproval: true,
      run: { status: 'completed', stepResults: { final: { stepId: 'final', status: 'completed' } } },
    })).toThrow('missing a real completed execution');
  });

  it('verifies that debate synthesis follows both completed perspectives', () => {
    const step = (id, start, finish) => ({ stepId: id, status: 'completed', content: 'A short response', startedAt: start, completedAt: finish });
    const result = { run: { status: 'completed', stepResults: { quickstart: step('quickstart', 1, 10), architecture: step('architecture', 1, 12), synthesis: step('synthesis', 11, 20) } } };
    expect(() => validateCompletedExample('community-debate', result)).toThrow('before both');
    result.run.stepResults.synthesis.startedAt = 12;
    expect(() => validateCompletedExample('community-debate', result)).not.toThrow();
  });
});
