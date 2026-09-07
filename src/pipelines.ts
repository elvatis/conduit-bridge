import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runtimeDir } from './config.js';
import type { ProviderRegistry } from './registry.js';
import type { ProviderAgentPolicy } from './types.js';
import type { BudgetManager } from './budget.js';
import type { GovernanceManager } from './governance.js';

export type PipelineStepExecutionType = 'sequential' | 'parallel' | 'fan_out';
export type PipelineRunStatus = 'running' | 'waiting_approval' | 'completed' | 'failed' | 'rejected';
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
        if (Array.isArray(parsed)) this.runs = parsed.slice(-50);
      } catch { /* ignore corrupt run history */ }
    }
  }

  private savePipelines(): void {
    mkdirSync(dirname(this.pipelinesFile), { recursive: true });
    writeFileSync(this.pipelinesFile, JSON.stringify(this.pipelines, null, 2), { mode: 0o600 });
    chmodSync(this.pipelinesFile, 0o600);
  }

  private saveRuns(): void {
    mkdirSync(dirname(this.runsFile), { recursive: true });
    writeFileSync(this.runsFile, JSON.stringify(this.runs.slice(-50), null, 2), { mode: 0o600 });
    chmodSync(this.runsFile, 0o600);
  }

  listPipelines(categoryFilter?: string, repoFilter?: string): PipelineDefinition[] {
    const customIds = new Set(this.pipelines.map(p => p.id));
    const presets = PRESET_PIPELINES.filter(p => !customIds.has(p.id));
    let all = [...presets, ...this.pipelines];
    if (categoryFilter) {
      all = all.filter(p => p.category === categoryFilter);
    }
    if (repoFilter) {
      all = all.filter(p => !p.repository || p.repository === repoFilter);
    }
    return all;
  }

  getPipeline(id: string): PipelineDefinition | undefined {
    return this.listPipelines().find(p => p.id === id);
  }

  savePipeline(def: PipelineDefinition): PipelineDefinition {
    const index = this.pipelines.findIndex(p => p.id === def.id);
    const updated = { ...def, isBuiltIn: false };
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
    return list;
  }

  getRun(id: string): PipelineRun | undefined {
    return this.runs.find(r => r.id === id);
  }

  recordRun(run: PipelineRun): void {
    const index = this.runs.findIndex(r => r.id === run.id);
    if (index >= 0) {
      this.runs[index] = run;
    } else {
      this.runs.push(run);
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

  let rendered = template.replace(/\{\{\s*prompt\s*\}\}/gi, initialPrompt);

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

  rendered = rendered.replace(/\{\{\s*previous_output\s*\}\}/gi, previousOutput);
  rendered = rendered.replace(/\{\{\s*prior_steps\s*\}\}/gi, priorStepsSummary);
  rendered = rendered.replace(/\{\{\s*input\s*\}\}/gi, previousOutput || initialPrompt);

  // Support direct step reference {{step.<id>.output}}
  for (const [stepId, res] of Object.entries(stepResults)) {
    const re = new RegExp(`\\{\\{\\s*step\\.${stepId}\\.output\\s*\\}\\}`, 'gi');
    rendered = rendered.replace(re, res.content || '');
  }

  return rendered;
}

/**
 * Estimate token count from string length (~4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Execute a pipeline run against registered providers with budget, audit, and parallel review stage support.
 */
export async function runPipeline(
  pipeline: PipelineDefinition,
  initialPrompt: string,
  registry: ProviderRegistry,
  options: {
    agentPolicies?: Partial<Record<string, ProviderAgentPolicy>>;
    onEvent?: (level: 'info' | 'success' | 'warning' | 'error', message: string, details?: string) => void;
    existingRun?: PipelineRun;
    approvedStepId?: string;
    signal?: AbortSignal;
    correlationId?: string;
    repository?: string;
    workingDirectory?: string;
    budgetManager?: BudgetManager;
    governanceManager?: GovernanceManager;
    operator?: string;
  } = {},
): Promise<PipelineRun> {
  const log = options.onEvent || (() => {});
  const correlationId = options.correlationId || options.existingRun?.correlationId || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const run: PipelineRun = options.existingRun ?? {
    id: `pipe-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    initialPrompt,
    status: 'running',
    startedAt: Date.now(),
    stepResults: {},
    correlationId,
    repository: options.repository,
    workingDirectory: options.workingDirectory,
    tokensConsumed: 0,
    costUsd: 0,
  };

  log('info', `Pipeline '${pipeline.name}' started [${correlationId}]`, `Repository: ${options.repository || 'default'}`);

  // Budget validation before starting execution
  if (options.budgetManager) {
    const budgetCheck = options.budgetManager.checkRunBudget();
    if (!budgetCheck.allowed) {
      run.status = 'failed';
      run.completedAt = Date.now();
      log('error', `Pipeline rejected by budget limit: ${budgetCheck.reason}`);
      return run;
    }
    if (budgetCheck.warning) {
      log('warning', budgetCheck.warning);
    }
  }

  // Initialize missing step result states
  for (const step of pipeline.steps) {
    if (!run.stepResults[step.id]) {
      run.stepResults[step.id] = {
        stepId: step.id,
        stepName: step.name,
        model: step.model,
        status: 'pending',
      };
    }
  }

  // Identify parallel groups
  const stepMap = new Map(pipeline.steps.map(s => [s.id, s]));

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const existing = run.stepResults[step.id];

    // Skip completed steps
    if (existing && existing.status === 'completed') {
      continue;
    }

    // Check if resuming an approved step
    if (existing && existing.status === 'waiting_approval' && options.approvedStepId === step.id) {
      existing.status = 'completed';
      run.pendingApprovalStepId = undefined;
      if (options.governanceManager) {
        options.governanceManager.recordAudit({
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          runId: run.id,
          stepId: step.id,
          stepName: step.name,
          model: step.model,
          repository: options.repository,
          operator: options.operator || 'operator',
          action: 'approved',
          feedback: options.existingRun?.approvalFeedback,
          correlationId,
        });
      }
      log('success', `Approval granted for step '${step.name}' [${correlationId}]`);
      continue;
    }

    // Check dependencies
    if (step.dependsOn && step.dependsOn.length) {
      const depsCompleted = step.dependsOn.every(depId => run.stepResults[depId]?.status === 'completed');
      if (!depsCompleted) {
        continue;
      }
    }

    // Human checkpoint gate
    if (step.requiresApproval && existing.status !== 'waiting_approval' && options.approvedStepId !== step.id) {
      existing.status = 'waiting_approval';
      run.status = 'waiting_approval';
      run.pendingApprovalStepId = step.id;
      log('warning', `Approval checkpoint reached: step '${step.name}' awaits authorization`, `Model: ${step.model}`);
      return run;
    }

    // Parallel review group detection: if this step has a parallelGroup, find sibling steps in same group
    const parallelSiblings = step.parallelGroup
      ? pipeline.steps.filter(s =>
          s.id !== step.id &&
          s.parallelGroup === step.parallelGroup &&
          run.stepResults[s.id]?.status === 'pending' &&
          (!s.dependsOn || s.dependsOn.every(d => run.stepResults[d]?.status === 'completed')) &&
          !s.requiresApproval
        )
      : [];

    const stepsToRun = [step, ...parallelSiblings];

    // Execute steps (either single or concurrent parallel group)
    const runStepAction = async (targetStep: PipelineStep): Promise<boolean> => {
      const targetRes = run.stepResults[targetStep.id];
      targetRes.status = 'running';
      targetRes.startedAt = Date.now();
      log('info', `Executing step '${targetStep.name}' on ${targetStep.model}`);

      const promptText = interpolatePrompt(targetStep.promptTemplate, initialPrompt, run.stepResults, targetStep.dependsOn);
      const provider = registry.providerForModel(targetStep.model);

      if (!provider) {
        targetRes.status = 'failed';
        targetRes.error = `Provider not found for model: ${targetStep.model}`;
        targetRes.completedAt = Date.now();
        log('error', `Step '${targetStep.name}' failed: provider not found for ${targetStep.model}`);
        return false;
      }

      const isConnected = await provider.ensureConnected();
      if (!isConnected) {
        targetRes.status = 'failed';
        targetRes.error = `Provider ${provider.name} is not connected`;
        targetRes.completedAt = Date.now();
        log('error', `Step '${targetStep.name}' failed: ${provider.name} not connected`);
        return false;
      }

      const stepMode = targetStep.mode || 'chat';
      if (stepMode === 'agent') {
        const policy = options.agentPolicies?.[provider.name];
        if (policy && policy.agentEnabled === false) {
          targetRes.status = 'failed';
          targetRes.error = `Agent mode disabled for provider ${provider.name} by policy`;
          targetRes.completedAt = Date.now();
          log('error', `Step '${targetStep.name}' failed: agent mode disabled for ${provider.name}`);
          return false;
        }
      }

      try {
        const startTime = Date.now();
        const inputTokens = estimateTokens(promptText);
        const output = await provider.chat({
          model: targetStep.model,
          messages: [{ role: 'user', content: promptText }],
          mode: stepMode,
          cwd: options.workingDirectory,
          signal: options.signal,
        });

        const outputTokens = estimateTokens(output);
        const totalTokens = inputTokens + outputTokens;
        const estCost = totalTokens * 0.000003; // ~$3 per million tokens estimate

        targetRes.content = output;
        targetRes.status = 'completed';
        targetRes.latencyMs = Date.now() - startTime;
        targetRes.completedAt = Date.now();

        run.tokensConsumed = (run.tokensConsumed || 0) + totalTokens;
        run.costUsd = Math.round(((run.costUsd || 0) + estCost) * 1e6) / 1e6;

        if (options.budgetManager) {
          options.budgetManager.recordSpend(estCost, totalTokens);
        }

        log('success', `Step '${targetStep.name}' completed on ${targetStep.model} (${targetRes.latencyMs} ms)`);
        return true;
      } catch (err) {
        targetRes.status = 'failed';
        targetRes.error = (err as Error).message;
        targetRes.completedAt = Date.now();
        log('error', `Step '${targetStep.name}' failed: ${(err as Error).message}`);
        return false;
      }
    };

    if (stepsToRun.length > 1) {
      log('info', `Running ${stepsToRun.length} steps in parallel (Group: ${step.parallelGroup})`);
      const results = await Promise.all(stepsToRun.map(s => runStepAction(s)));
      if (results.some(r => !r)) {
        run.status = 'failed';
        return run;
      }
    } else {
      const ok = await runStepAction(step);
      if (!ok) {
        run.status = 'failed';
        return run;
      }
    }
  }

  const allCompleted = pipeline.steps.every(s => run.stepResults[s.id]?.status === 'completed');
  if (allCompleted) {
    run.status = 'completed';
    run.completedAt = Date.now();
    log('success', `Pipeline '${pipeline.name}' completed successfully [${correlationId}]`, `Total tokens: ${run.tokensConsumed}, Cost: $${(run.costUsd || 0).toFixed(4)}`);
  }

  return run;
}
