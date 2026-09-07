import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runtimeDir } from './config.js';
import type { ProviderRegistry } from './registry.js';
import type { ProviderAgentPolicy, ProviderAdapter, ChatRequest } from './types.js';
import type { BudgetManager } from './budget.js';
import type { GovernanceManager } from './governance.js';
import type { MetricsStore } from './metrics.js';
import { abortable, executeWithAccounting, estimateTokens, estimateCost } from './usage.js';
import { redactSecrets } from './redact.js';

export type PipelineStepExecutionType = 'sequential' | 'parallel' | 'fan_out';
export type PipelineRunStatus = 'running' | 'waiting_approval' | 'completed' | 'failed' | 'rejected' | 'cancelled' | 'interrupted';
export type StepRunStatus = 'pending' | 'running' | 'completed' | 'waiting_approval' | 'failed' | 'rejected';

export interface PipelineStep {
  id: string;
  name: string;
  model: string;
  mode?: 'chat' | 'plan' | 'agent';
  promptTemplate?: string;
  requiresApproval?: boolean;
  dependsOn?: string[];
  parallelGroup?: string;
  max_tokens?: number;
  effort?: string;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  isBuiltIn?: boolean;
  category?: 'governance' | 'engineering' | 'review' | 'security' | 'custom';
  repository?: string;
}

export interface PipelineRunStepResult {
  stepId: string;
  stepName: string;
  model: string;
  status: StepRunStatus;
  content?: string;
  error?: string;
  latencyMs?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  pipelineName: string;
  initialPrompt: string;
  status: PipelineRunStatus;
  startedAt: number;
  completedAt?: number;
  stepResults: Record<string, PipelineRunStepResult>;
  pendingApprovalStepId?: string;
  approvalFeedback?: string;
  correlationId?: string;
  repository?: string;
  workingDirectory?: string;
  costUsd?: number;
  tokensConsumed?: number;
  /** Frozen definition: later edits must not change an in-progress run. */
  definition?: PipelineDefinition;
  error?: string;
  maxCostPerRunUsd?: number;
  executionMs?: number;
  contentRetained?: boolean;
}

export const MAX_PIPELINE_PROMPT_CHARS = 100000;
export const MAX_PIPELINE_OUTPUT_CHARS = 200000;

/** Durable summaries contain no prompts or model output. Live context stays in memory. */
export function summarizePipelineRun(value: PipelineRun): PipelineRun {
  const run = structuredClone(value);
  run.initialPrompt = '';
  run.contentRetained = false;
  delete run.definition;
  if (run.approvalFeedback) run.approvalFeedback = redactSecrets(run.approvalFeedback);
  if (run.error) run.error = redactSecrets(run.error).slice(0, 4000);
  for (const step of Object.values(run.stepResults)) {
    if (step.error) step.error = redactSecrets(step.error).slice(0, 4000);
    delete step.content;
  }
  return run;
}

export function validatePipeline(pipeline: PipelineDefinition): void {
  const safeId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  const boundedText = (value: unknown, maximum: number, required = false): value is string => typeof value === 'string' && value.length <= maximum && (!required || !!value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
  if (!pipeline || !safeId(pipeline.id) || !boundedText(pipeline.name, 200, true) || !Array.isArray(pipeline.steps) || !pipeline.steps.length || pipeline.steps.length > 50) throw new Error('Pipeline requires a safe id, bounded name and 1–50 steps');
  if (!boundedText(pipeline.description, 4000)) throw new Error('Pipeline description must be a string of at most 4000 characters');
  if (pipeline.repository !== undefined && !boundedText(pipeline.repository, 300, true)) throw new Error('Invalid pipeline repository');
  if (pipeline.category !== undefined && !['governance', 'engineering', 'review', 'security', 'custom'].includes(pipeline.category)) throw new Error('Unsupported pipeline category');
  const steps = new Map<string, PipelineStep>();
  for (const step of pipeline.steps) {
    if (!step || !safeId(step.id) || !boundedText(step.model, 300, true) || !boundedText(step.name, 200, true) || steps.has(step.id)) throw new Error('Pipeline step IDs must be unique safe identifiers; bounded model and name are required');
    if (step.promptTemplate !== undefined && !boundedText(step.promptTemplate, MAX_PIPELINE_PROMPT_CHARS)) throw new Error('Pipeline prompt template must be a bounded string');
    if (step.parallelGroup !== undefined && !safeId(step.parallelGroup)) throw new Error('parallelGroup must be a safe identifier');
    if (step.requiresApproval !== undefined && typeof step.requiresApproval !== 'boolean') throw new Error('requiresApproval must be a boolean');
    if (step.mode && !['chat', 'plan', 'agent'].includes(step.mode)) throw new Error('Unsupported step mode');
    if (step.dependsOn !== undefined && (!Array.isArray(step.dependsOn) || step.dependsOn.length > 50 || !step.dependsOn.every(safeId) || new Set(step.dependsOn).size !== step.dependsOn.length)) throw new Error('dependsOn must contain at most 50 unique safe IDs');
    if (step.max_tokens !== undefined && (!Number.isInteger(step.max_tokens) || step.max_tokens < 1 || step.max_tokens > 32768)) throw new Error('Step max_tokens must be an integer from 1 to 32768');
    if (step.effort !== undefined && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(step.effort)) throw new Error('Unsupported step effort');
    steps.set(step.id, step);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Pipeline dependency cycle at ${id}`);
    if (visited.has(id)) return;
    const step = steps.get(id);
    if (!step) throw new Error(`Unknown pipeline dependency: ${id}`);
    visiting.add(id);
    for (const dependency of step.dependsOn || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of steps.keys()) visit(id);
}

export const PRESET_PIPELINES: PipelineDefinition[] = [
  // 1. Standard Enterprise Governance Pipeline
  {
    id: 'standard-governance',
    name: 'Standard Governance (Implementation -> Peer -> Security -> Compliance -> Sign-off)',
    description: 'Enterprise governance workflow with independent peer, security, and compliance reviews ending in a mandatory human sign-off gate.',
    isBuiltIn: true,
    category: 'governance',
    steps: [
      {
        id: 'step-impl',
        name: 'Implementation & Solution Crafting',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'agent',
        promptTemplate: 'You are the Senior Implementation Engineer. Execute the requested feature or fix with high quality, rigorous typing, and complete error handling:\n\n{{prompt}}',
      },
      {
        id: 'step-code-review',
        name: 'Independent Peer Code Review',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-impl'],
        parallelGroup: 'review-phase',
        promptTemplate: 'You are the Independent Code Reviewer. Critique the implementation for logic defects, edge cases, performance regressions, and architectural cleanliness:\n\n{{previous_output}}',
      },
      {
        id: 'step-security-review',
        name: 'Security & Vulnerability Audit',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-impl'],
        parallelGroup: 'review-phase',
        promptTemplate: 'You are the Application Security Specialist. Perform an in-depth security analysis on the implementation, checking for credential exposure, command injection, path traversal, and permission boundaries:\n\n{{previous_output}}',
      },
      {
        id: 'step-compliance-review',
        name: 'Compliance & Governance Policy Check',
        model: 'cli-grok/grok-4.6',
        mode: 'chat',
        dependsOn: ['step-impl'],
        parallelGroup: 'review-phase',
        promptTemplate: 'You are the Compliance Auditor. Verify that the code satisfies corporate architectural conventions, documentation integrity, and dependency policy:\n\n{{previous_output}}',
      },
      {
        id: 'step-final-approval',
        name: 'Final Governance Sign-off & Synthesis',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'chat',
        dependsOn: ['step-code-review', 'step-security-review', 'step-compliance-review'],
        requiresApproval: true,
        promptTemplate: 'Synthesize the peer code review, security audit, and compliance findings into a final release-readiness verdict:\n\n{{prior_steps}}',
      },
    ],
  },

  // 2. Documentation Generation
  {
    id: 'doc-generation',
    name: 'Automated Documentation Generation',
    description: 'Inspects code surface, produces structured markdown guides, and generates cross-reference navigation.',
    isBuiltIn: true,
    category: 'engineering',
    steps: [
      {
        id: 'step-doc-analysis',
        name: 'Codebase Architecture & API Extraction',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'plan',
        promptTemplate: 'Analyze the codebase modules, exports, and workflows. Extract key components, usage guidelines, and parameter contracts:\n\n{{prompt}}',
      },
      {
        id: 'step-doc-writing',
        name: 'Markdown Documentation Writer',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-doc-analysis'],
        promptTemplate: 'Write comprehensive, developer-friendly documentation in GitHub Flavored Markdown with clean examples:\n\n{{previous_output}}',
      },
      {
        id: 'step-doc-integration',
        name: 'Navigation & Cross-Link Verification',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-doc-writing'],
        promptTemplate: 'Validate markdown links, code blocks, and headings to ensure flawless doc navigation:\n\n{{previous_output}}',
      },
    ],
  },

  // 3. Documentation Review
  {
    id: 'doc-review',
    name: 'Documentation Quality & Accuracy Review',
    description: 'Verifies technical accuracy of guides, validates code samples, and enforces style guidelines.',
    isBuiltIn: true,
    category: 'review',
    steps: [
      {
        id: 'step-doc-accuracy',
        name: 'Technical Accuracy Check',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        promptTemplate: 'Verify that the documentation accurately reflects the underlying implementation and code contracts:\n\n{{prompt}}',
      },
      {
        id: 'step-doc-clarity',
        name: 'Style, Grammar & Readability Review',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'chat',
        dependsOn: ['step-doc-accuracy'],
        promptTemplate: 'Improve clarity, tone, and conciseness while eliminating ambiguity:\n\n{{previous_output}}',
      },
      {
        id: 'step-doc-signoff',
        name: 'Documentation Publish Approval',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-doc-clarity'],
        requiresApproval: true,
        promptTemplate: 'Provide final publication recommendations and sign off:\n\n{{previous_output}}',
      },
    ],
  },

  // 4. Refactoring Review
  {
    id: 'refactoring-review',
    name: 'Refactoring & Structural Optimization Review',
    description: 'Detects architectural smells, designs clean structural refactoring, and evaluates regression risks.',
    isBuiltIn: true,
    category: 'review',
    steps: [
      {
        id: 'step-smell-analysis',
        name: 'Code Smell & Complexity Detection',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'plan',
        promptTemplate: 'Identify tight coupling, cyclomatic complexity, duplicated patterns, and technical debt in:\n\n{{prompt}}',
      },
      {
        id: 'step-refactor-proposal',
        name: 'Structural Refactoring Blueprint',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-smell-analysis'],
        promptTemplate: 'Propose step-by-step refactoring moves preserving public interfaces while improving testability:\n\n{{previous_output}}',
      },
      {
        id: 'step-regression-risk',
        name: 'Regression Risk Assessment & Checkpoint',
        model: 'cli-grok/grok-4.6',
        mode: 'chat',
        dependsOn: ['step-refactor-proposal'],
        requiresApproval: true,
        promptTemplate: 'Analyze potential breaking changes, migration impacts, and rollback procedures:\n\n{{previous_output}}',
      },
    ],
  },

  // 5. Automated PR Review
  {
    id: 'pr-review',
    name: 'Automated Pull Request Multi-Agent Review',
    description: 'Evaluates pull requests across diff summarization, design analysis, and test coverage verification.',
    isBuiltIn: true,
    category: 'review',
    steps: [
      {
        id: 'step-pr-diff',
        name: 'PR Diff & Intent Summarization',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        promptTemplate: 'Summarize the pull request diff, key intent, and behavioral changes:\n\n{{prompt}}',
      },
      {
        id: 'step-pr-arch',
        name: 'Architecture & Design Critique',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'chat',
        dependsOn: ['step-pr-diff'],
        parallelGroup: 'pr-eval',
        promptTemplate: 'Review PR architecture, separation of concerns, and backward compatibility:\n\n{{previous_output}}',
      },
      {
        id: 'step-pr-test',
        name: 'Test Coverage & Edge Cases',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-pr-diff'],
        parallelGroup: 'pr-eval',
        promptTemplate: 'Verify whether all branches, error paths, and edge conditions have sufficient unit test coverage:\n\n{{previous_output}}',
      },
      {
        id: 'step-pr-gate',
        name: 'PR Merge Authorization Gate',
        model: 'cli-grok/grok-4.6',
        mode: 'chat',
        dependsOn: ['step-pr-arch', 'step-pr-test'],
        requiresApproval: true,
        promptTemplate: 'Compile the architectural and test findings into a definitive PR merge verdict (Approve / Request Changes):\n\n{{prior_steps}}',
      },
    ],
  },

  // 6. Release Readiness Review
  {
    id: 'release-readiness',
    name: 'Release Readiness & Governance Audit',
    description: 'Validates changelog entries, scans security advisories, and verifies governance gate compliance.',
    isBuiltIn: true,
    category: 'governance',
    steps: [
      {
        id: 'step-release-verify',
        name: 'Changelog & SemVer Verification',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'plan',
        promptTemplate: 'Verify semver version synchronization, changelog formatting, and release notes:\n\n{{prompt}}',
      },
      {
        id: 'step-release-sec',
        name: 'Security Advisory & CVE Scan',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-release-verify'],
        promptTemplate: 'Inspect dependencies and runtime configurations for known vulnerabilities or CVEs:\n\n{{previous_output}}',
      },
      {
        id: 'step-release-gate',
        name: 'Production Deployment Sign-off',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-release-sec'],
        requiresApproval: true,
        promptTemplate: 'Deliver final release readiness assessment and operator authorization checklist:\n\n{{previous_output}}',
      },
    ],
  },

  // 7. Architecture Review
  {
    id: 'architecture-review',
    name: 'System Architecture & Scalability Review',
    description: 'Evaluates service boundaries, concurrency patterns, and produces an Architecture Decision Record.',
    isBuiltIn: true,
    category: 'review',
    steps: [
      {
        id: 'step-arch-eval',
        name: 'System Boundary & Cohesion Evaluation',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'plan',
        promptTemplate: 'Evaluate system cohesion, module boundaries, and dependency graphs for:\n\n{{prompt}}',
      },
      {
        id: 'step-scale-eval',
        name: 'Concurrency & Scalability Analysis',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-arch-eval'],
        promptTemplate: 'Analyze throughput, resource bottlenecks, lock contention, and memory footprint:\n\n{{previous_output}}',
      },
      {
        id: 'step-adr-synthesis',
        name: 'Architecture Decision Record (ADR) Synthesis',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-scale-eval'],
        promptTemplate: 'Synthesize findings into an enterprise Architecture Decision Record (ADR):\n\n{{prior_steps}}',
      },
    ],
  },

  // 8. Dependency Risk Review
  {
    id: 'dependency-risk',
    name: 'Dependency Risk & License Compliance Review',
    description: 'Discovers vulnerable or stale dependencies and checks open source license compliance.',
    isBuiltIn: true,
    category: 'security',
    steps: [
      {
        id: 'step-dep-inventory',
        name: 'Dependency Inventory & Freshness Scan',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        promptTemplate: 'Enumerate third-party libraries and identify outdated or abandoned packages in:\n\n{{prompt}}',
      },
      {
        id: 'step-license-audit',
        name: 'License Compatibility & Compliance Audit',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'chat',
        dependsOn: ['step-dep-inventory'],
        promptTemplate: 'Check package licenses against corporate copyleft and commercial redistribution policies:\n\n{{previous_output}}',
      },
      {
        id: 'step-upgrade-checkpoint',
        name: 'Dependency Upgrade Authorization',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-license-audit'],
        requiresApproval: true,
        promptTemplate: 'Formulate an actionable dependency update roadmap with minimum breaking changes:\n\n{{previous_output}}',
      },
    ],
  },

  // 9. Supply Chain Security Review
  {
    id: 'supply-chain-security',
    name: 'Supply Chain & Build Integrity Review',
    description: 'Audits build pipeline security, action pinning, and provenance attestations.',
    isBuiltIn: true,
    category: 'security',
    steps: [
      {
        id: 'step-pipeline-audit',
        name: 'CI Workflow & Action Security Inspection',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'plan',
        promptTemplate: 'Audit GitHub Actions and CI configurations for unpinned dependencies and secret exfiltration risks in:\n\n{{prompt}}',
      },
      {
        id: 'step-integrity-check',
        name: 'Artifact Integrity & Signature Verification',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-pipeline-audit'],
        promptTemplate: 'Review cryptographic provenance, package hash pinning, and tamper protection:\n\n{{previous_output}}',
      },
      {
        id: 'step-supply-chain-gate',
        name: 'Supply Chain Attestation Gate',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-integrity-check'],
        requiresApproval: true,
        promptTemplate: 'Sign off on build pipeline integrity and supply chain hygiene:\n\n{{previous_output}}',
      },
    ],
  },

  // 10. Tri-Vendor Review Chain
  {
    id: 'tri-vendor-review',
    name: 'Tri-Vendor Review Chain (Claude -> Codex -> Gemini)',
    description: 'Autonomous implementation proposal, followed by independent peer code review and security validation with human approval checkpoint.',
    isBuiltIn: true,
    category: 'engineering',
    steps: [
      {
        id: 'step-plan',
        name: 'Architecture & Implementation Plan',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'plan',
        promptTemplate: 'You are the Lead Architect. Analyze the requirements and provide a robust technical implementation plan:\n\n{{prompt}}',
      },
      {
        id: 'step-review',
        name: 'Peer Code Review & Bug Analysis',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        dependsOn: ['step-plan'],
        promptTemplate: 'You are the Senior Reviewer. Inspect this technical plan, critique potential edge cases, and propose concrete improvements:\n\n{{previous_output}}',
      },
      {
        id: 'step-security',
        name: 'Security & Hardening Audit',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-review'],
        requiresApproval: true,
        promptTemplate: 'You are the Security Auditor. Review the implementation and code review for security vulnerabilities, permission boundaries, and supply-chain hygiene:\n\n{{previous_output}}',
      },
    ],
  },

  // 11. Code Generation -> Testing -> Validation
  {
    id: 'code-gen-test',
    name: 'Code Generation -> Testing -> Validation Pipeline',
    description: 'Generates code, derives automated test specifications, and performs cross-model validation.',
    isBuiltIn: true,
    category: 'engineering',
    steps: [
      {
        id: 'step-codegen',
        name: 'Code Generation',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        promptTemplate: 'Generate complete, production-ready code with strong typing and error handling for:\n\n{{prompt}}',
      },
      {
        id: 'step-tests',
        name: 'Automated Test Suite',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'chat',
        dependsOn: ['step-codegen'],
        promptTemplate: 'Generate thorough unit and integration tests covering happy path, failure branches, and edge cases for:\n\n{{previous_output}}',
      },
      {
        id: 'step-validation',
        name: 'Contract Validation & Lint Review',
        model: 'cli-grok/grok-4.6',
        mode: 'chat',
        dependsOn: ['step-tests'],
        promptTemplate: 'Validate that the generated tests cleanly verify the implementation contract without regressions:\n\n{{previous_output}}',
      },
    ],
  },

  // 12. Debate & Synthesis Panel
  {
    id: 'debate-consensus',
    name: 'Debate & Synthesis Panel',
    description: 'Independent parallel analysis from multiple models synthesized into a unified consensus.',
    isBuiltIn: true,
    category: 'review',
    steps: [
      {
        id: 'step-panel-a',
        name: 'Perspective A (Claude)',
        model: 'cli-claude/claude-sonnet-5',
        mode: 'chat',
        parallelGroup: 'panel-analysis',
        promptTemplate: 'Provide a structured solution emphasizing reliability, maintainability, and clean architecture:\n\n{{prompt}}',
      },
      {
        id: 'step-panel-b',
        name: 'Perspective B (Codex)',
        model: 'cli-codex/gpt-5.6-sol',
        mode: 'chat',
        parallelGroup: 'panel-analysis',
        promptTemplate: 'Provide a structured solution emphasizing performance, concurrency, and algorithmic efficiency:\n\n{{prompt}}',
      },
      {
        id: 'step-consensus',
        name: 'Consensus Synthesis & Final Action',
        model: 'cli-gemini/gemini-3.8-flash-high',
        mode: 'chat',
        dependsOn: ['step-panel-a', 'step-panel-b'],
        promptTemplate: 'Critique the prior independent answers and produce a unified consensus action plan:\n\n{{prior_steps}}',
      },
    ],
  },
];

export class PipelineStore {
  private pipelines: PipelineDefinition[] = [];
  private runs: PipelineRun[] = [];
  private readonly pipelinesFile: string;
  private readonly runsFile: string;

  constructor(
    pipelinesFile = join(runtimeDir(), 'pipelines.json'),
    runsFile = join(runtimeDir(), 'pipeline-runs.json'),
  ) {
    this.pipelinesFile = pipelinesFile;
    this.runsFile = runsFile;
    this.load();
  }

  private load(): void {
    if (existsSync(this.pipelinesFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.pipelinesFile, 'utf8'));
        if (Array.isArray(parsed)) this.pipelines = parsed;
      } catch { /* keep defaults on parse failure */ }
    }
    if (existsSync(this.runsFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.runsFile, 'utf8'));
        if (Array.isArray(parsed)) this.runs = parsed.slice(-50).map(summarizePipelineRun);
      } catch { /* ignore corrupt run history */ }
    }
    let interrupted = false;
    for (const run of this.runs) {
      if (run.status === 'running' || run.status === 'waiting_approval') {
        run.status = 'interrupted';
        run.error = 'Bridge restarted; private execution context is not persisted. Inspect the workspace before starting a new run';
        run.completedAt = Date.now();
        for (const step of Object.values(run.stepResults)) if (step.status === 'running' || step.status === 'waiting_approval') { step.status = 'failed'; step.error = run.error; step.completedAt = run.completedAt; }
        run.pendingApprovalStepId = undefined;
        interrupted = true;
      }
    }
    if (interrupted || existsSync(this.runsFile)) this.saveRuns();
    const reserved = new Set(PRESET_PIPELINES.map(p => p.id));
    const custom = this.pipelines.filter(p => {
      try { validatePipeline(p); return !reserved.has(p.id); } catch { return false; }
    });
    if (custom.length !== this.pipelines.length) { this.pipelines = custom; this.savePipelines(); }
  }

  private savePipelines(): void {
    mkdirSync(dirname(this.pipelinesFile), { recursive: true });
    const temporary = `${this.pipelinesFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.pipelines, null, 2), { mode: 0o600 });
    renameSync(temporary, this.pipelinesFile);
  }

  private saveRuns(): void {
    mkdirSync(dirname(this.runsFile), { recursive: true });
    const temporary = `${this.runsFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.runs.map(summarizePipelineRun), null, 2), { mode: 0o600 });
    renameSync(temporary, this.runsFile);
  }

  listPipelines(categoryFilter?: string, repoFilter?: string): PipelineDefinition[] {
    const reserved = new Set(PRESET_PIPELINES.map(p => p.id));
    let all = [...PRESET_PIPELINES, ...this.pipelines.filter(p => !reserved.has(p.id))];
    if (categoryFilter) {
      all = all.filter(p => p.category === categoryFilter);
    }
    if (repoFilter) {
      all = all.filter(p => !p.repository || p.repository === repoFilter);
    }
    return structuredClone(all);
  }

  getPipeline(id: string): PipelineDefinition | undefined {
    return this.listPipelines().find(p => p.id === id);
  }

  savePipeline(def: PipelineDefinition): PipelineDefinition {
    validatePipeline(def);
    if (PRESET_PIPELINES.some(p => p.id === def.id)) throw new Error('Built-in pipeline IDs are reserved; save a copy with a new ID');
    const index = this.pipelines.findIndex(p => p.id === def.id);
    const updated = structuredClone({ ...def, isBuiltIn: false });
    if (index >= 0) {
      this.pipelines[index] = updated;
    } else {
      this.pipelines.push(updated);
    }
    this.savePipelines();
    return updated;
  }

  deletePipeline(id: string): boolean {
    const prevLen = this.pipelines.length;
    this.pipelines = this.pipelines.filter(p => p.id !== id);
    if (this.pipelines.length !== prevLen) {
      this.savePipelines();
      return true;
    }
    return false;
  }

  listRuns(repoFilter?: string): PipelineRun[] {
    let list = [...this.runs].reverse();
    if (repoFilter) {
      list = list.filter(r => r.repository === repoFilter);
    }
    return structuredClone(list);
  }

  getRun(id: string): PipelineRun | undefined {
    const run = this.runs.find(r => r.id === id);
    return run ? structuredClone(run) : undefined;
  }

  recordRun(run: PipelineRun): void {
    run = structuredClone(run);
    if (run.error) run.error = redactSecrets(run.error);
    for (const step of Object.values(run.stepResults)) if (step.error) step.error = redactSecrets(step.error);
    const index = this.runs.findIndex(r => r.id === run.id);
    if (index >= 0) {
      this.runs[index] = structuredClone(run);
    } else {
      if (this.runs.length >= 50) {
        const terminal = this.runs.findIndex(r => !['running', 'waiting_approval'].includes(r.status));
        if (terminal < 0) throw new Error('Pipeline history capacity reached; finish existing active runs first');
        this.runs.splice(terminal, 1);
      }
      this.runs.push(structuredClone(run));
    }
    this.saveRuns();
  }
}

/**
 * Render prompt templates by substituting {{prompt}}, {{previous_output}}, and {{prior_steps}}.
 */
export function interpolatePrompt(
  template: string | undefined,
  initialPrompt: string,
  stepResults: Record<string, PipelineRunStepResult>,
  dependsOn?: string[],
): string {
  if (!template) {
    const priorContent = Object.values(stepResults)
      .filter(r => r.status === 'completed' && r.content)
      .map(r => `--- ${r.stepName} (${r.model}) ---\n${r.content}`)
      .join('\n\n');
    return priorContent ? `${initialPrompt}\n\nPrior Context:\n${priorContent}` : initialPrompt;
  }

  let rendered = template.replace(/\{\{\s*prompt\s*\}\}/gi, () => initialPrompt);

  const completedSteps = Object.values(stepResults).filter(r => r.status === 'completed' && r.content);
  const relevantSteps = dependsOn && dependsOn.length
    ? completedSteps.filter(r => dependsOn.includes(r.stepId))
    : completedSteps;

  const previousOutput = relevantSteps.length
    ? relevantSteps[relevantSteps.length - 1].content ?? ''
    : '';

  const priorStepsSummary = relevantSteps
    .map(r => `[${r.stepName} - ${r.model}]:\n${r.content}`)
    .join('\n\n');

  rendered = rendered.replace(/\{\{\s*previous_output\s*\}\}/gi, () => previousOutput);
  rendered = rendered.replace(/\{\{\s*prior_steps\s*\}\}/gi, () => priorStepsSummary);
  rendered = rendered.replace(/\{\{\s*input\s*\}\}/gi, () => previousOutput || initialPrompt);

  // Support direct step reference {{step.<id>.output}}
  for (const [stepId, res] of Object.entries(stepResults)) {
    const re = new RegExp(`\\{\\{\\s*step\\.${stepId}\\.output\\s*\\}\\}`, 'gi');
    rendered = rendered.replace(re, () => res.content || '');
  }

  return rendered;
}

/**
 * Estimate token count from string length (~4 chars per token).
 */

/**
 * Execute a pipeline run against registered providers with budget, audit, and parallel review stage support.
 */
export async function runPipeline(
  pipeline: PipelineDefinition,
  initialPrompt: string,
  registry: ProviderRegistry,
  options: {
    agentPolicies?: Partial<Record<string, ProviderAgentPolicy>>;
    onEvent?: (level: 'info' | 'success' | 'warning' | 'error', message: string, details?: string, metadata?: Record<string, unknown>) => void;
    existingRun?: PipelineRun;
    approvedStepId?: string;
    signal?: AbortSignal;
    correlationId?: string;
    repository?: string;
    workingDirectory?: string;
    budgetManager?: BudgetManager;
    governanceManager?: GovernanceManager;
    metrics?: MetricsStore;
    operator?: string;
    maxCostPerRunUsd?: number;
    onRunUpdate?: (run: PipelineRun) => void;
    resolveExecutionPolicy?: (providerName: string, mode: 'chat' | 'plan' | 'agent') => { allowed: boolean; disallowedTools?: string; reason?: string };
    executeStep?: (provider: ProviderAdapter, request: ChatRequest) => Promise<string>;
  } = {},
): Promise<PipelineRun> {
  if (options.existingRun) {
    if (options.existingRun.status !== 'waiting_approval') throw new Error('Only a waiting pipeline can be resumed');
    if (!options.approvedStepId || options.approvedStepId !== options.existingRun.pendingApprovalStepId) throw new Error('Approved step must match the pending approval checkpoint');
    if (!options.existingRun.definition) throw new Error('Legacy run lacks an immutable definition; start a new run');
    pipeline = structuredClone(options.existingRun.definition);
    initialPrompt = options.existingRun.initialPrompt;
  }
  validatePipeline(pipeline);
  if (!initialPrompt.trim() || initialPrompt.length > MAX_PIPELINE_PROMPT_CHARS) throw new Error(`Pipeline prompt must contain 1–${MAX_PIPELINE_PROMPT_CHARS} characters`);
  const run: PipelineRun = options.existingRun ? structuredClone(options.existingRun) : {
    id: `pipe-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    initialPrompt,
    status: 'running',
    startedAt: Date.now(),
    stepResults: {},
    correlationId: options.correlationId || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    repository: options.repository,
    workingDirectory: options.workingDirectory,
    tokensConsumed: 0,
    costUsd: 0,
    definition: structuredClone(pipeline),
    maxCostPerRunUsd: options.maxCostPerRunUsd,
    contentRetained: true,
  };
  const log = (level: 'info' | 'success' | 'warning' | 'error', message: string, stepId?: string, details?: string) => options.onEvent?.(level, message, details, { runId: run.id, stepId, correlationId: run.correlationId, repository: run.repository });
  const publish = () => options.onRunUpdate?.(structuredClone(run));
  const controller = new AbortController();
  const duration = options.budgetManager?.getConfig().maxDurationMs ?? 120000;
  const segmentStartedAt = Date.now();
  const timer = duration > 0 ? setTimeout(() => controller.abort(new Error('Pipeline execution deadline exceeded')), Math.max(1, duration - (run.executionMs || 0))) : undefined;
  timer?.unref();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  run.status = 'running';
  run.completedAt = undefined;
  run.error = undefined;
  for (const step of pipeline.steps) run.stepResults[step.id] ||= { stepId: step.id, stepName: step.name, model: step.model, status: 'pending' };
  try {
    // First persist must succeed before invoking any external provider.
    publish();
    if (duration > 0 && (run.executionMs || 0) >= duration) throw new Error('Pipeline execution deadline exceeded');
    options.budgetManager?.beginRun(run.id, { costUsd: run.costUsd, tokens: run.tokensConsumed, maxCostUsd: run.maxCostPerRunUsd });
    log('info', `Pipeline '${pipeline.name}' ${options.existingRun ? 'resumed' : 'started'}`);
    if (options.approvedStepId) {
      const approved = run.stepResults[options.approvedStepId];
      if (approved?.status !== 'waiting_approval') throw new Error('Approved step is not waiting for approval');
      options.governanceManager?.recordAudit({
        pipelineId: run.pipelineId, pipelineName: run.pipelineName, runId: run.id,
        stepId: approved.stepId, stepName: approved.stepName, model: approved.model,
        repository: run.repository, operator: options.operator || 'operator', action: 'approved',
        feedback: run.approvalFeedback, correlationId: run.correlationId,
      });
      // Authorization precedes execution; it is not an execution result.
      approved.status = 'pending';
      run.pendingApprovalStepId = undefined;
      publish();
    }
    const runStep = async (step: PipelineStep): Promise<void> => {
      const result = run.stepResults[step.id];
      try {
        signal.throwIfAborted();
        result.status = 'running';
        result.startedAt = Date.now();
        publish();
        log('info', `Executing '${step.name}' on ${step.model}`, step.id);
        const prompt = interpolatePrompt(step.promptTemplate, initialPrompt, run.stepResults, step.dependsOn);
        if (prompt.length > MAX_PIPELINE_PROMPT_CHARS) throw new Error('Interpolated pipeline prompt exceeds the character limit');
        const provider = registry.providerForModel(step.model);
        if (!provider) throw new Error(`Provider not found for model: ${step.model}`);
        const mode = step.mode || 'chat';
        const policy = options.agentPolicies?.[provider.name];
        if (mode === 'agent' && policy?.agentEnabled === false) throw new Error(`Agent mode disabled for provider ${provider.name} by policy`);
        const resolved = options.resolveExecutionPolicy?.(provider.name, mode);
        if (resolved && !resolved.allowed) throw new Error(resolved.reason || `Execution forbidden for ${provider.name}`);
        if (!await abortable(provider.ensureConnected(), signal)) throw new Error(`Provider ${provider.name} is not connected`);
        signal.throwIfAborted();
        const output = await executeWithAccounting(provider, {
          model: step.model, messages: [{ role: 'user', content: prompt }], mode,
          cwd: run.workingDirectory, signal, disallowedTools: resolved?.disallowedTools ?? policy?.disallowedTools,
          max_tokens: step.max_tokens, effort: step.effort,
        }, {
          budgetManager: options.budgetManager, metrics: options.metrics, runId: run.id,
          maxOutputChars: MAX_PIPELINE_OUTPUT_CHARS,
          onWarning: message => log('warning', message, step.id),
          execute: options.executeStep ? request => options.executeStep!(provider, request) : undefined,
        });
        result.content = output;
        result.status = 'completed';
        const tokens = estimateTokens(prompt) + estimateTokens(output);
        run.tokensConsumed = (run.tokensConsumed || 0) + tokens;
        run.costUsd = Number(((run.costUsd || 0) + estimateCost(step.model, estimateTokens(prompt), estimateTokens(output))).toFixed(8));
        log('success', `Step '${step.name}' completed`, step.id);
      } catch (error) {
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : String(error);
        log('error', `Step '${step.name}' failed: ${result.error}`, step.id);
        // Stop sibling work promptly on a failed parallel branch.
        controller.abort(error);
      } finally {
        if (options.budgetManager) {
          const spend = options.budgetManager.getRunSpend(run.id);
          run.costUsd = spend.costUsd;
          run.tokensConsumed = spend.tokens;
        }
        result.completedAt = Date.now();
        result.latencyMs = result.startedAt ? result.completedAt - result.startedAt : 0;
        publish();
      }
    };
    while (true) {
      signal.throwIfAborted();
      const pending = pipeline.steps.filter(s => run.stepResults[s.id].status === 'pending');
      if (!pending.length) break;
      const ready = pending.filter(s => (s.dependsOn || []).every(id => run.stepResults[id].status === 'completed'));
      if (!ready.length) throw new Error('Pipeline cannot progress because a dependency did not complete');
      const first = ready[0];
      if (first.requiresApproval && first.id !== options.approvedStepId) {
        run.stepResults[first.id].status = 'waiting_approval';
        run.pendingApprovalStepId = first.id;
        run.status = 'waiting_approval';
        run.executionMs = (run.executionMs || 0) + Date.now() - segmentStartedAt;
        log('warning', `Approval checkpoint: '${first.name}' awaits authorization`, first.id);
        publish();
        return run;
      }
      const group = first.parallelGroup
        ? ready.filter(s => s.parallelGroup === first.parallelGroup && (!s.requiresApproval || s.id === options.approvedStepId))
        : [first];
      // Bounded concurrency preserves parallel groups without launching arbitrary fan-out.
      for (let offset = 0; offset < group.length; offset += 4) {
        await Promise.all(group.slice(offset, offset + 4).map(runStep));
        if (group.some(s => run.stepResults[s.id].status === 'failed')) throw new Error('A pipeline step failed');
      }
    }
    run.status = 'completed';
    log('success', `Pipeline '${pipeline.name}' completed`);
  } catch (error) {
    run.status = options.signal?.aborted ? 'cancelled' : 'failed';
    run.error = error instanceof Error ? error.message : String(error);
    log('error', `Pipeline ${run.status}: ${run.error}`);
  } finally {
    if (timer) clearTimeout(timer);
    if (run.status !== 'waiting_approval') {
      run.executionMs = (run.executionMs || 0) + Date.now() - segmentStartedAt;
      run.completedAt = Date.now();
      options.budgetManager?.finishRun(run.id);
      publish();
    }
  }
  return run;
}
