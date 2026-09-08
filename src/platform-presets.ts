import { validatePipeline, type PipelineDefinition, type PipelineStep } from './pipelines.js';

export interface CodingPipelineModels { planner: string; implementer: string; reviewer: string; security: string; }

/** Bind role models at installation time; no stale provider/model IDs are embedded. */
export function buildCodingPipelines(models: CodingPipelineModels, efforts: Partial<Record<keyof CodingPipelineModels, string>> = {}, fastModes: Partial<Record<keyof CodingPipelineModels, boolean>> = {}): PipelineDefinition[] {
  for (const [role, model] of Object.entries(models)) {
    if (typeof model !== 'string' || !model.trim() || model.length > 300 || /[\r\n\0]/.test(model)) throw new Error(`A valid model is required for ${role}`);
  }
  for (const role of ['planner', 'implementer', 'reviewer', 'security'] as const) if (!models[role]) throw new Error(`A model is required for ${role}`);
  const evidence = 'Use the original requirement and actual source/diff/test artifacts. A prior model narrative is a claim, not verification. Cite inspected paths and exact executed commands/results. If artifacts are absent or a check was not run, report insufficient evidence instead of inventing a pass.';
  const prompt = (task: string) => `${task}\n\n${evidence}\n\nOriginal task:\n{{prompt}}\n\nDependency evidence:\n{{prior_steps}}`;
  const step = (id: string, name: string, role: keyof CodingPipelineModels, task: string, dependencies: string[] = [], extra: Partial<PipelineStep> = {}): PipelineStep => ({
    id, name, model: models[role], ...(efforts[role] ? { effort: efforts[role] } : {}), ...(fastModes[role] !== undefined ? { fastMode: fastModes[role] } : {}), mode: 'chat', max_tokens: 1536,
    dependsOn: dependencies, promptTemplate: prompt(task), ...extra,
  });
  const implement = (dependencies: string[]) => step('implement', 'Implement and collect verification evidence', 'implementer',
    'After the human checkpoint, implement only the approved scope. Preserve unrelated edits. Reproduce the old failure when applicable, add the focused regression, and run relevant tests/build checks. Capture the actual resulting diff and command outputs as review artifacts. Return artifact paths, command exit status, changed behavior, and unresolved failures. Do not merge or deploy.',
    dependencies, { mode: 'agent', max_tokens: 4096, requiresApproval: true });
  const review = (dependencies: string[]) => step('review', 'Independent review of code and evidence', 'reviewer',
    'Independently inspect the changed code/diff and verification artifacts. Check original acceptance criteria, compatibility and realistic failure paths. Output actionable findings with severity, paths/lines, trigger and evidence; distinguish optional improvements. Do not modify the workspace. State whether the collected tests actually demonstrate the requested behavior.', dependencies);
  const security = (dependencies: string[]) => step('security', 'Dedicated security review', 'security',
    'As the configured security reviewer, inspect the actual change and execution boundaries using the attached evidence. Return evidence-backed security/hardening findings and required mitigations. Do not treat another model’s approval as evidence. Do not modify the workspace or publish anything.', dependencies);
  const final = (dependencies: string[]) => step('decision', 'Final evidence and acceptance decision', 'reviewer',
    'Synthesize the independent findings against each original acceptance criterion. Return: passed checks with evidence; failed or unexecuted checks; unresolved findings; recommended next action. The checkpoint authorizes this assessment only. A completed model response does not imply that the code passed tests or was approved for merge/deployment.', dependencies, { requiresApproval: true });
  const pipelines: PipelineDefinition[] = [
    {
      id: 'platform-bugfix-regression', name: 'Bug reproduction → fix → regression review', category: 'engineering',
      description: 'Reproduce a defect, approve a focused implementation, then independently inspect regression and security evidence.',
      steps: [
        step('reproduce', 'Reproduction and root-cause plan', 'planner', 'Derive the smallest reproduction from the supplied failure and source. State expected/actual behavior, root cause, minimal fix and regression criteria. Cite what was inspected; do not modify files or claim unexecuted commands ran.'),
        implement(['reproduce']),
        review(['reproduce', 'implement']),
        security(['implement']),
        final(['reproduce', 'implement', 'review', 'security']),
      ],
    },
    {
      id: 'platform-api-contract', name: 'API contract → implementation → compatibility', category: 'engineering',
      description: 'Define API behavior, implement the agreed contract, and review compatibility with real examples and tests.',
      steps: [
        step('contract', 'API contract and acceptance cases', 'planner', 'Specify request/response schemas, status codes, lifecycle/cancellation, compatibility constraints and sample inputs. List executable contract tests. Do not change code.'),
        implement(['contract']),
        step('compatibility', 'Independent compatibility analysis', 'reviewer', 'Compare the agreed API contract with the actual diff and test artifacts. Exercise reasoning about existing client requests, validation failures, cancellation, retries and streaming termination. Identify unsupported cases without claiming model reasoning replaces executed contract tests.', ['contract', 'implement']),
        security(['contract', 'implement']),
        final(['contract', 'implement', 'compatibility', 'security']),
      ],
    },
    {
      id: 'platform-doc-code-verification', name: 'Documentation ↔ code verification', category: 'review',
      description: 'Inspect documentation against source and captured command evidence without workspace mutation.',
      steps: [
        step('inventory', 'Documentation and code contract inventory', 'planner', 'Inventory the supplied documentation, relevant source interfaces and command examples. Map each documented promise to a source location or an execution artifact. Mark unsupported claims explicitly.'),
        step('accuracy', 'Independent accuracy and example review', 'reviewer', 'Check the documented examples, option names, setup steps and failure-recovery guidance against actual source and command evidence. Report inaccurate or unverifiable statements with exact locations. Propose concise corrected text without modifying files.', ['inventory']),
        step('draft', 'Corrected documentation proposal', 'planner', 'Produce a corrected documentation proposal and change rationale using the inventory and accuracy findings. Label planned versus implemented behavior and preserve explicit limitations. Do not claim any example was executed without its command artifact.', ['inventory', 'accuracy']),
        final(['inventory', 'accuracy', 'draft']),
      ],
    },
    {
      id: 'platform-design-decision', name: 'Competing designs → evidence-based decision', category: 'review',
      description: 'Compare independent maintainability and performance perspectives and resolve their disagreements explicitly.',
      steps: [
        step('maintainability', 'Maintainability and operational simplicity', 'planner', 'Propose at most two viable designs prioritizing correctness, maintainability and operational simplicity. Identify constraints, assumptions, tradeoffs and failure scenarios. Ground every repository-specific claim in inspected source or supplied evidence.', [], { parallelGroup: 'designs' }),
        step('performance', 'Performance and extension alternatives', 'reviewer', 'Independently propose viable designs emphasizing resource bounds, throughput and extension points. Include measurement plans, complexity and likely failure scenarios. Avoid speculative rewrites without evidence.', [], { parallelGroup: 'designs' }),
        security(['maintainability', 'performance']),
        step('synthesis', 'Resolve alternatives and write a decision record', 'planner', 'Compare both proposals and the dedicated security review against original constraints. Produce an ADR with chosen approach, rejected alternatives, consequences, measurable acceptance criteria and unresolved evidence. Do not average contradictory claims.', ['maintainability', 'performance', 'security']),
        final(['maintainability', 'performance', 'security', 'synthesis']),
      ],
    },
    {
      id: 'platform-feature-review', name: 'Plan → implement → test evidence → review', category: 'engineering',
      description: 'A gated feature workflow with real implementation artifacts, independent test-evidence review and dedicated security analysis.',
      steps: [
        step('plan', 'Requirements, plan and acceptance criteria', 'planner', 'Translate the task into observable acceptance criteria, affected modules, implementation order and deterministic verification. State assumptions and preserve existing public contracts. Do not implement.'),
        implement(['plan']),
        step('test-evidence', 'Verification artifact review', 'reviewer', 'Inspect the actual test commands, exit status and output captured by implementation. Map them to acceptance criteria and failure branches. Identify missing or misleading coverage. Report unexecuted checks as unverified; do not execute workspace-writing tests in this review-only step.', ['plan', 'implement']),
        review(['plan', 'implement', 'test-evidence']),
        security(['plan', 'implement']),
        final(['plan', 'implement', 'test-evidence', 'review', 'security']),
      ],
    },
  ];
  pipelines.forEach(validatePipeline);
  return pipelines;
}
