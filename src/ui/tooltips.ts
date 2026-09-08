/** Short, user-facing help for a configurable dashboard setting. */
export interface SettingTooltip {
  readonly label: string;
  readonly help: string;
  readonly docsUrl?: string;
}

/** Named settings and their concise help; each help string is limited to 120 characters. */
export type TooltipRegistry = Readonly<Record<string, SettingTooltip>>;

/** Shared wording for settings rendered by the dashboard and platform workspace. */
export const TOOLTIP_REGISTRY = {
  'model': { label: 'Model', help: 'Choose the provider and model that will handle this request. Availability depends on its configured connection.' },
  'mode': { label: 'Run mode', help: 'Chat answers a prompt; Plan proposes work; Agent may change workspace files within its execution policy.' },
  'workspace': { label: 'Workspace', help: 'Select a registered workspace. Its path and permissions constrain file access and agent execution.' },
  'workingDirectory': { label: 'Working directory', help: 'Absolute local directory used for execution. Agent mode requires an allowed workspace path.' },
  'effort': { label: 'Effort', help: 'Choose a provider-supported reasoning effort. Higher effort can increase latency and token use.' },
  'prompt': { label: 'Prompt', help: 'Describe the task and its acceptance criteria. This text is sent to the selected provider.' },
  'pipeline.id': { label: 'Pipeline', help: 'Choose the saved workflow to run. Review its models, dependencies, and approval checkpoints first.' },
  'pipeline.repository': { label: 'Repository target', help: 'Bind the run to a registered repository and apply its workspace and governance rules.' },
  'pipeline.name': { label: 'Pipeline name', help: 'A recognizable name for this reusable workflow. It appears in the pipeline catalog and execution history.' },
  'pipeline.description': { label: 'Pipeline description', help: 'Briefly explain the workflow purpose so operators can choose the right pipeline.' },
  'pipeline.stepName': { label: 'Step name', help: 'Name this step by its responsibility, such as planning, implementation, or independent review.' },
  'pipeline.template': { label: 'Prompt template', help: 'Insert {{prompt}}, {{previous_output}}, or {{prior_steps}} to include task and dependency context.' },
  'pipeline.approval': { label: 'Approval checkpoint', help: 'Pause before this step until an authorized operator approves it. Approval does not skip execution.' },
  'approval.feedback': { label: 'Approval feedback', help: 'Optional guidance recorded with the approval or rejection. Review the pending work before deciding.' },
  'budget.dailyBudgetUsd': { label: 'Daily budget', help: 'Maximum estimated spend per UTC day. A zero limit blocks new work when hard-stop enforcement is enabled.' },
  'budget.monthlyBudgetUsd': { label: 'Monthly budget', help: 'Maximum estimated spend per UTC month. A zero limit blocks new work when hard-stop enforcement is enabled.' },
  'budget.maxCostPerRunUsd': { label: 'Run cost limit', help: 'Cap estimated cost for one run. Provider usage estimates can differ from the eventual billed amount.' },
  'budget.maxTokensPerRun': { label: 'Run token limit', help: 'Cap combined input and output token estimates for one run, including all of its steps.' },
  'budget.warningThresholdPercent': { label: 'Budget warning threshold', help: 'Show a warning when estimated spending reaches this percentage of the configured budget.' },
  'budget.hardStop': { label: 'Limit enforcement', help: 'Hard stop blocks work that exceeds budget limits. Warning-only mode reports limits without enforcing them.' },
  'workspace.name': { label: 'Workspace name', help: 'An optional friendly label for the registered local directory. It does not change the directory path.' },
  'repository.id': { label: 'Repository identifier', help: 'Stable repository identifier, usually owner/name. Runs use it to locate registered governance settings.' },
  'repository.name': { label: 'Repository name', help: 'A friendly repository name shown in governance lists and selection controls.' },
  'repository.description': { label: 'Repository description', help: 'Describe the repository purpose and architectural role for operators reviewing governance settings.' },
  'repository.pipeline': { label: 'Governance pipeline', help: 'Choose the workflow associated with this repository. Review the workflow before assigning it.' },
  'orchestrator.enabled': { label: 'Orchestration enabled', help: 'Enable the configured multi-role orchestration workflow for requests using the orchestration endpoint.' },
  'orchestrator.strategy': { label: 'Orchestration strategy', help: 'Sequential passes outputs between roles; Parallel gathers independent views; Debate chains responses.' },
  'orchestrator.fallbackModels': { label: 'Fallback models', help: 'Models to try when the initial route fails. Each fallback remains subject to its provider policy.' },
  'orchestrator.roleModel': { label: 'Role model', help: 'Choose the model assigned to this orchestration role. Role order follows the configured strategy.' },
  'agentPolicy.agentEnabled': { label: 'Agent mode permission', help: 'Allow or block workspace-writing agent mode for this provider. Chat and plan retain their own restrictions.' },
  'agentPolicy.defaultMode': { label: 'Default run mode', help: 'The mode used when a request does not specify one. Provider policy still governs allowed operations.' },
  'agentPolicy.disallowedTools': { label: 'Restricted tools', help: 'Selected tools are denied for this provider. Clearing restrictions does not override other execution policies.' },
  'apiKey': { label: 'API key', help: 'Write-only provider credential. Saving replaces the stored key; existing secrets are never displayed.' },
  'session.title': { label: 'Conversation title', help: 'A local title used to find this conversation. Changing it does not alter the transcript.' },
  'session.search': { label: 'Conversation search', help: 'Filter the conversation list by title without changing stored messages.' },
  'session.profileId': { label: 'Provider profile', help: 'Use a named credential and execution profile. Its provider must match the selected model.' },
  'session.retention': { label: 'Conversation retention', help: 'Conversations are always saved locally until explicit deletion. No automatic expiry.' },
  'session.workspaceId': { label: 'Conversation workspace', help: 'Set the workspace scope when creating a conversation. An existing conversation keeps its original scope.' },
  'session.agentId': { label: 'Agent persona', help: 'Attach the selected agent instructions and pinned skill versions without granting extra tool permissions.' },
  'session.contextTokens': { label: 'Context token budget', help: 'Budget for input plus output. Older turns may be omitted; inspect context to see what will be included.' },
  'session.maxOutputTokens': { label: 'Response token limit', help: 'Reserve an upper bound for the next reply. This must be smaller than the context token budget.' },
  'session.skillRefs': { label: 'Versioned skills', help: 'Attach exact skill versions. Updating the catalog does not silently change a pinned attachment.' },
  'session.memoryIds': { label: 'Approved memories', help: 'Only selected, approved memories matching this conversation and provider scope enter the request context.' },
  'session.summaryThrough': { label: 'Summary boundary', help: 'Choose the completed assistant turn through which a reviewed summary replaces older request context.' },
  'session.summary': { label: 'Reviewed summary', help: 'Retain key facts and decisions in future context. Saving a summary leaves the original transcript intact.' },
  'session.editBranch': { label: 'Edited branch', help: 'Create a separate conversation before this message, then review and send the edited text in that branch.' },
  'memory.title': { label: 'Memory title', help: 'A short label that makes this memory recognizable in search and context attachment lists.' },
  'memory.content': { label: 'Memory content', help: 'Store a concise fact or preference. New entries require review before they can be attached to a conversation.' },
  'memory.scope': { label: 'Memory scope', help: 'Limit the memory to a user, workspace, agent, provider, or profile. Scope is fixed after creation.' },
  'memory.scopeId': { label: 'Memory scope identifier', help: 'Use the exact registered ID for the selected scope. User scope is assigned to the authenticated operator.' },
  'memory.status': { label: 'Memory review status', help: 'Candidates await review; approved memories can be attached; rejected entries remain excluded from context.' },
  'memory.search': { label: 'Memory search', help: 'Filter visible memories by title or content. Scope and review-status filters also apply.' },
  'catalog.name': { label: 'Catalog name', help: 'A recognizable name for this reusable agent, skill, or prompt.' },
  'catalog.description': { label: 'Catalog description', help: 'Explain when this reusable instruction set should be selected.' },
  'catalog.version': { label: 'Catalog version', help: 'Skills and prompts use immutable versions. Agent edits use a revision check to detect concurrent changes.' },
  'catalog.instructions': { label: 'Reusable instructions', help: 'Instructions used by this agent, skill, or prompt. They do not grant permissions beyond the execution policy.' },
  'catalog.tags': { label: 'Catalog tags', help: 'Comma-separated labels used to organize and find this instruction set.' },
  'catalog.requiredTools': { label: 'Required tools', help: 'Comma-separated tool names required by these instructions. Incompatible tool policies block attachment.' },
  'catalog.modes': { label: 'Supported modes', help: 'Select every execution mode in which this skill or prompt is valid.' },
  'catalog.search': { label: 'Catalog search', help: 'Filter catalog entries by name, description, or tag without changing their versions.' },
  'run.maxIterations': { label: 'Maximum iterations', help: 'Stop after at most this many iterations, even if the requested success text has not appeared.' },
  'run.maxDurationMs': { label: 'Maximum duration', help: 'Execution time limit in seconds. The run is interrupted when its configured time allowance is exhausted.' },
  'run.maxOutputTokens': { label: 'Iteration output limit', help: 'Maximum response tokens for each iteration. The total run token budget also applies.' },
  'run.successPattern': { label: 'Success text', help: 'A literal text match used as a stopping condition. It is not a regular expression or proof that code is correct.' },
  'run.requiresApproval': { label: 'Run approval', help: 'Require approval before the run begins. Repository-mandated approval still applies when this is disabled.' },
  'evaluation.models': { label: 'Evaluation models', help: 'Run one short instruction-following check per selected model. Choose at most eight models.' },
  'preset.model': { label: 'Preset default model', help: 'Bind all preset roles to this model unless a role override is selected below.' },
  'preset.planner': { label: 'Planner model', help: 'Override the model used to inspect the requirement and plan the preset workflow.' },
  'preset.implementer': { label: 'Implementer model', help: 'Override the model used for approved implementation steps. Agent capability and workspace policy still apply.' },
  'preset.reviewer': { label: 'Reviewer model', help: 'Override the model used for independent review and the final evidence assessment.' },
  'preset.security': { label: 'Security reviewer model', help: 'Override the model assigned to dedicated security review steps in this preset.' },
  'profile.name': { label: 'Profile name', help: 'Name this reusable provider configuration so it can be selected for conversations and agent runs.' },
  'profile.provider': { label: 'Profile provider', help: 'Provider whose models and credentials this profile uses. A profile cannot route a model from another provider.' },
  'profile.cliExecutable': { label: 'CLI executable', help: 'Optional existing absolute executable path. Leave empty to use normal CLI discovery.' },
  'profile.apiKey': { label: 'Profile API key', help: 'Write-only API credential. Leave empty to preserve the current key; CLI profiles use their existing CLI login.' },
  'profile.clearCredential': { label: 'Remove stored key', help: 'Explicitly remove this profile\'s stored API key when saving. Preserve keeps the current credential.' },
  'profile.maxConcurrent': { label: 'Profile concurrency', help: 'Maximum simultaneous requests using this profile. Server-wide concurrency limits still apply.' },
  'profile.enabled': { label: 'Profile enabled', help: 'Disabled profiles cannot execute requests. Existing profile settings remain stored.' },
  'storage.backend': { label: 'Storage backend', help: 'Save a backend preference for the next restart. Export first; changing this setting does not migrate data.' },
  'storage.restore': { label: 'Encrypted backup restore', help: 'Restore an encrypted backup into the active backend. Existing platform state is replaced; stop active work first.' },
} as const satisfies TooltipRegistry;

/** Setting keys accepted by the reusable help component. */
export type SettingTooltipKey = keyof typeof TOOLTIP_REGISTRY;

/** Static control IDs mapped to semantic setting keys. */
export const SETTING_TOOLTIP_IDS: Readonly<Record<string, SettingTooltipKey>> = {
  'play-model': 'model', 'play-mode': 'mode', 'play-cwd': 'workingDirectory', 'play-ws-select': 'workspace', 'play-prompt': 'prompt',
  'pipe-run-select': 'pipeline.id', 'pipe-run-repo': 'pipeline.repository', 'pipe-run-cwd': 'workspace', 'pipe-run-prompt': 'prompt',
  'cfg-daily-budget': 'budget.dailyBudgetUsd', 'cfg-monthly-budget': 'budget.monthlyBudgetUsd', 'cfg-max-cost-run': 'budget.maxCostPerRunUsd', 'cfg-max-tokens-run': 'budget.maxTokensPerRun', 'cfg-warn-threshold': 'budget.warningThresholdPercent', 'cfg-hard-stop': 'budget.hardStop',
  'new-ws-path': 'workingDirectory', 'new-ws-name': 'workspace.name', 'orch-enabled': 'orchestrator.enabled', 'orch-strategy': 'orchestrator.strategy', 'orch-fallbacks': 'orchestrator.fallbackModels',
  'pipe-name-input': 'pipeline.name', 'pipe-desc-input': 'pipeline.description', 'repo-id-input': 'repository.id', 'repo-name-input': 'repository.name', 'repo-path-input': 'workingDirectory', 'repo-desc-input': 'repository.description', 'repo-pipeline-select': 'repository.pipeline',
  'pf-session-search': 'session.search', 'pf-chat-title': 'session.title', 'pf-chat-model': 'model', 'pf-chat-profile': 'session.profileId', 'pf-chat-retention': 'session.retention', 'pf-chat-workspace': 'session.workspaceId', 'pf-chat-agent': 'session.agentId', 'pf-chat-context': 'session.contextTokens', 'pf-chat-output': 'session.maxOutputTokens', 'pf-chat-skills': 'session.skillRefs', 'pf-chat-memories': 'session.memoryIds', 'pf-summary-through': 'session.summaryThrough', 'pf-summary-content': 'session.summary', 'pf-edit-content': 'session.editBranch', 'pf-chat-input': 'prompt',
  'pf-memory-search': 'memory.search', 'pf-memory-status-filter': 'memory.status', 'pf-memory-scope-filter': 'memory.scope', 'pf-memory-title': 'memory.title', 'pf-memory-scope': 'memory.scope', 'pf-memory-scope-id': 'memory.scopeId', 'pf-memory-content': 'memory.content',
  'pf-preset-model': 'preset.model', 'pf-preset-planner': 'preset.planner', 'pf-preset-implementer': 'preset.implementer', 'pf-preset-reviewer': 'preset.reviewer', 'pf-preset-security': 'preset.security',
  'pf-library-search': 'catalog.search', 'pf-entry-name': 'catalog.name', 'pf-entry-version': 'catalog.version', 'pf-entry-description': 'catalog.description', 'pf-entry-body': 'catalog.instructions', 'pf-entry-model': 'model', 'pf-entry-mode': 'mode', 'pf-entry-skills': 'session.skillRefs', 'pf-entry-tags': 'catalog.tags', 'pf-entry-tools': 'catalog.requiredTools', 'pf-entry-modes': 'catalog.modes',
  'pf-run-prompt': 'prompt', 'pf-run-model': 'model', 'pf-run-agent': 'session.agentId', 'pf-run-mode': 'mode', 'pf-run-workspace': 'workspace', 'pf-run-output': 'run.maxOutputTokens', 'pf-run-approval': 'run.requiresApproval', 'pf-run-iterations': 'run.maxIterations', 'pf-run-duration': 'run.maxDurationMs', 'pf-run-cost': 'budget.maxCostPerRunUsd', 'pf-run-tokens': 'budget.maxTokensPerRun', 'pf-run-success': 'run.successPattern', 'pf-run-feedback': 'approval.feedback', 'pf-evaluation-models': 'evaluation.models',
  'pf-storage-backend': 'storage.backend', 'pf-storage-restore-file': 'storage.restore', 'pf-profile-name': 'profile.name', 'pf-profile-provider': 'profile.provider', 'pf-profile-executable': 'profile.cliExecutable', 'pf-profile-model': 'model', 'pf-profile-key': 'profile.apiKey', 'pf-profile-clear': 'profile.clearCredential', 'pf-profile-concurrency': 'profile.maxConcurrent', 'pf-profile-enabled': 'profile.enabled',
};

/** Selectors for provider policies and pipeline controls generated after initial rendering. */
export const DYNAMIC_SETTING_TOOLTIPS: ReadonlyArray<{ selector: string; key: SettingTooltipKey }> = [
  { selector: 'select[name="agentEnabled"]', key: 'agentPolicy.agentEnabled' },
  { selector: 'select[name="defaultMode"]', key: 'agentPolicy.defaultMode' },
  { selector: 'input[name="disallowedTools"]', key: 'agentPolicy.disallowedTools' },
  { selector: '.step-name-inp', key: 'pipeline.stepName' },
  { selector: '.step-model-inp', key: 'model' },
  { selector: '.step-mode-inp', key: 'mode' },
  { selector: '.step-approval-inp', key: 'pipeline.approval' },
  { selector: '.step-prompt-inp', key: 'pipeline.template' },
  { selector: '[data-orch-role]', key: 'orchestrator.roleModel' },
  { selector: '[data-key-provider] input[type="password"]', key: 'apiKey' },
  { selector: '#checkpoint-feedback', key: 'approval.feedback' },
];

/** Look up help without treating inherited object properties as setting keys. */
export function getSettingTooltip(key: string): SettingTooltip | undefined {
  return Object.hasOwn(TOOLTIP_REGISTRY, key) ? TOOLTIP_REGISTRY[key as SettingTooltipKey] : undefined;
}
