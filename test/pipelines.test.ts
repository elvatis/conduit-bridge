import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { interpolatePrompt, PipelineStore, runPipeline, type PipelineDefinition, type PipelineRun } from '../src/pipelines.js';
import type { ProviderRegistry } from '../src/registry.js';
import type { Provider } from '../src/types.js';

describe('Pipeline Subsystem', () => {
  describe('interpolatePrompt', () => {
    it('interpolates {{prompt}} with initial prompt', () => {
      const result = interpolatePrompt('Task: {{prompt}}', 'Build a bridge', {});
      expect(result).toBe('Task: Build a bridge');
    });

    it('interpolates {{previous_output}} and {{prior_steps}} from completed steps', () => {
      const stepResults = {
        'step-1': {
          stepId: 'step-1',
          stepName: 'Architect',
          model: 'cli-claude/claude-sonnet-5',
          status: 'completed' as const,
          content: 'Blueprint diagram',
        },
        'step-2': {
          stepId: 'step-2',
          stepName: 'Reviewer',
          model: 'cli-codex/gpt-5.6-sol',
          status: 'completed' as const,
          content: 'Review LGTM',
        },
      };

      const template = 'Previous: {{previous_output}}\nAll:\n{{prior_steps}}';
      const result = interpolatePrompt(template, 'Build a bridge', stepResults, ['step-1', 'step-2']);
      expect(result).toContain('Previous: Review LGTM');
      expect(result).toContain('[Architect - cli-claude/claude-sonnet-5]:\nBlueprint diagram');
      expect(result).toContain('[Reviewer - cli-codex/gpt-5.6-sol]:\nReview LGTM');
    });

    it('falls back to default concatenated context if no template provided', () => {
      const stepResults = {
        'step-1': {
          stepId: 'step-1',
          stepName: 'Step 1',
          model: 'test-model',
          status: 'completed' as const,
          content: 'Output from 1',
        },
      };
      const result = interpolatePrompt(undefined, 'Initial query', stepResults);
      expect(result).toContain('Initial query');
      expect(result).toContain('--- Step 1 (test-model) ---');
      expect(result).toContain('Output from 1');
    });
  });

  describe('PipelineStore', () => {
    let tmpDir: string;
    let pipeFile: string;
    let runsFile: string;
    let store: PipelineStore;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'conduit-pipe-test-'));
      pipeFile = join(tmpDir, 'pipelines.json');
      runsFile = join(tmpDir, 'runs.json');
      store = new PipelineStore(pipeFile, runsFile);
    });

    it('lists built-in presets by default', () => {
      const pipes = store.listPipelines();
      expect(pipes.length).toBeGreaterThanOrEqual(3);
      expect(pipes.some(p => p.id === 'tri-vendor-review')).toBe(true);
      expect(pipes.some(p => p.id === 'code-gen-test')).toBe(true);
      expect(pipes.some(p => p.id === 'debate-consensus')).toBe(true);
    });

    it('can save and retrieve custom pipelines', () => {
      const custom: PipelineDefinition = {
        id: 'custom-pipe-1',
        name: 'Custom Pipeline',
        description: 'Testing custom flow',
        steps: [
          { id: 's1', name: 'Step 1', model: 'cli-claude/claude-sonnet-5' },
        ],
      };
      store.savePipeline(custom);
      const retrieved = store.getPipeline('custom-pipe-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Custom Pipeline');
      expect(retrieved?.isBuiltIn).toBe(false);
    });

    it('can delete custom pipelines but leaves presets unaffected', () => {
      const custom: PipelineDefinition = {
        id: 'custom-pipe-2',
        name: 'Deletable Pipeline',
        description: 'To be removed',
        steps: [{ id: 's1', name: 'Step 1', model: 'cli-claude/claude-sonnet-5' }],
      };
      store.savePipeline(custom);
      expect(store.getPipeline('custom-pipe-2')).toBeDefined();

      const deleted = store.deletePipeline('custom-pipe-2');
      expect(deleted).toBe(true);
      expect(store.getPipeline('custom-pipe-2')).toBeUndefined();
    });

    it('records and lists runs in reverse chronological order', () => {
      const run1: PipelineRun = {
        id: 'run-1',
        pipelineId: 'tri-vendor-review',
        pipelineName: 'Tri-Vendor Review',
        initialPrompt: 'Prompt 1',
        status: 'completed',
        startedAt: 1000,
        completedAt: 2000,
        stepResults: {},
      };
      const run2: PipelineRun = {
        id: 'run-2',
        pipelineId: 'tri-vendor-review',
        pipelineName: 'Tri-Vendor Review',
        initialPrompt: 'Prompt 2',
        status: 'running',
        startedAt: 3000,
        stepResults: {},
      };

      store.recordRun(run1);
      store.recordRun(run2);

      const runs = store.listRuns();
      expect(runs.length).toBe(2);
      expect(runs[0].id).toBe('run-2');
      expect(runs[1].id).toBe('run-1');
    });
  });

  describe('runPipeline execution engine', () => {
    function createMockRegistry(responses: Record<string, (prompt: string) => string>): ProviderRegistry {
      const mockProvider: Provider = {
        name: 'cli-claude',
        loginType: 'cli',
        checkSession: async () => true,
        ensureConnected: async () => true,
        disconnect: async () => {},
        models: () => [
          { id: 'cli-claude/claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'cli-claude', contextWindow: 200000, maxOutputTokens: 8192 },
          { id: 'cli-codex/gpt-5.6-sol', name: 'Codex GPT 5.6', provider: 'cli-codex', contextWindow: 200000, maxOutputTokens: 8192 },
        ],
        chat: async (req) => {
          const userMsg = req.messages[0]?.content || '';
          const handler = responses[req.model];
          if (handler) {
            return handler(userMsg);
          }
          return `Echo from ${req.model}: ${userMsg}`;
        },
      };

      const mockCodexProvider: Provider = {
        ...mockProvider,
        name: 'cli-codex',
      };

      return {
        providerForModel: (model: string) => {
          if (model.startsWith('cli-claude')) return mockProvider;
          if (model.startsWith('cli-codex')) return mockCodexProvider;
          return undefined;
        },
      } as unknown as ProviderRegistry;
    }

    it('executes sequential pipeline steps and threads context forward', async () => {
      const registry = createMockRegistry({
        'cli-claude/claude-sonnet-5': (p) => `Architecture Plan for ${p}`,
        'cli-codex/gpt-5.6-sol': (p) => `Code Review for: ${p}`,
      });

      const pipeline: PipelineDefinition = {
        id: 'test-sequential',
        name: 'Sequential Pipeline',
        description: 'Test step propagation',
        steps: [
          {
            id: 'step-1',
            name: 'Architect',
            model: 'cli-claude/claude-sonnet-5',
            promptTemplate: 'Design: {{prompt}}',
          },
          {
            id: 'step-2',
            name: 'Reviewer',
            model: 'cli-codex/gpt-5.6-sol',
            dependsOn: ['step-1'],
            promptTemplate: 'Critique: {{previous_output}}',
          },
        ],
      };

      const run = await runPipeline(pipeline, 'Design auth microservice', registry);

      expect(run.status).toBe('completed');
      expect(run.stepResults['step-1'].status).toBe('completed');
      expect(run.stepResults['step-1'].content).toContain('Architecture Plan for Design: Design auth microservice');
      expect(run.stepResults['step-2'].status).toBe('completed');
      expect(run.stepResults['step-2'].content).toContain('Code Review for: Critique: Architecture Plan for Design: Design auth microservice');
    });

    it('pauses at human approval checkpoint and resumes after approval', async () => {
      const registry = createMockRegistry({
        'cli-claude/claude-sonnet-5': () => 'Initial proposal',
        'cli-codex/gpt-5.6-sol': () => 'Action executed after approval',
      });

      const pipeline: PipelineDefinition = {
        id: 'test-approval',
        name: 'Approval Pipeline',
        description: 'Test approval gate',
        steps: [
          {
            id: 'step-1',
            name: 'Proposal',
            model: 'cli-claude/claude-sonnet-5',
          },
          {
            id: 'step-2',
            name: 'Destructive Action',
            model: 'cli-codex/gpt-5.6-sol',
            dependsOn: ['step-1'],
            requiresApproval: true,
          },
        ],
      };

      const run1 = await runPipeline(pipeline, 'Deploy database migrations', registry);
      expect(run1.status).toBe('waiting_approval');
      expect(run1.pendingApprovalStepId).toBe('step-2');
      expect(run1.stepResults['step-1'].status).toBe('completed');
      expect(run1.stepResults['step-2'].status).toBe('waiting_approval');

      const run2 = await runPipeline(pipeline, 'Deploy database migrations', registry, {
        existingRun: run1,
        approvedStepId: 'step-2',
      });

      expect(run2.status).toBe('completed');
      expect(run2.pendingApprovalStepId).toBeUndefined();
      expect(run2.stepResults['step-2'].status).toBe('completed');
    });

    it('blocks execution when provider agent policy forbids agent mode', async () => {
      const registry = createMockRegistry({});
      const pipeline: PipelineDefinition = {
        id: 'test-agent-blocked',
        name: 'Blocked Agent Pipeline',
        description: 'Test agent policy gate',
        steps: [
          {
            id: 'step-agent',
            name: 'Agent Step',
            model: 'cli-claude/claude-sonnet-5',
            mode: 'agent',
          },
        ],
      };

      const run = await runPipeline(pipeline, 'Execute scripts', registry, {
        agentPolicies: {
          'cli-claude': {
            agentEnabled: false,
            defaultMode: 'chat',
          },
        },
      });

      expect(run.status).toBe('failed');
      expect(run.stepResults['step-agent'].status).toBe('failed');
      expect(run.stepResults['step-agent'].error).toContain('Agent mode disabled');
    });
  });
});
