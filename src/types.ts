// ── Public types for conduit-bridge ──────────────────────────────────────────
import type { OrchestratorConfig } from './orchestrator.js';
export type { PipelineDefinition, PipelineStep, PipelineRun, PipelineRunStepResult } from './pipelines.js';

export type ProviderName =
  | 'claude-api' | 'gemini-api' | 'codex-api'
  | 'openrouter-api' | 'perplexity-api'   // OpenAI-compatible API aggregators
  | 'lmstudio'                             // local OpenAI-compatible server
  | 'cli-grok'                             // local Grok CLI (x.ai/build, binary: grok)
  | 'cli-codex'                            // @openai/codex (binary: codex)
  | 'cli-claude'                           // @anthropic-ai/claude-code (binary: claude)
  | 'cli-gemini';                           // Antigravity CLI (binary: agy)

export type CliProviderName = Extract<ProviderName, `cli-${string}`>;
export type SecretReference = `vault:v1:${string}`;

export interface ApiKeyConfig {
  'claude-api'?: string;        // Anthropic API key
  'gemini-api'?: string;        // Google AI API key
  'codex-api'?: string;         // OpenAI API key
  'openrouter-api'?: string;    // OpenRouter API key (sk-or-v1-…)
  'perplexity-api'?: string;    // Perplexity API key (pplx-…)
}

export type ApiProviderName = keyof ApiKeyConfig;
export type ApiKeyReferenceConfig = Partial<Record<ApiProviderName, SecretReference>>;

export interface SecurityStorageConfig {
  /** Name only; the 32-byte base64/hex key stays in the process environment. */
  vaultKeyEnvironmentVariable?: string;
  /** Nonsecret namespace used for the OS-protected master key. */
  vaultKeyId?: string;
}

export interface CliExecutableDiagnostic {
  provider: CliProviderName;
  configured: boolean;
  requested: string;
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export type PlatformRole = 'viewer' | 'operator' | 'reviewer' | 'admin';

export interface PlatformOperatorConfig {
  /** Stable audit identity; never accepted from an HTTP request body. */
  id: string;
  displayName?: string;
  role: PlatformRole;
  /** Salted SHA-256 verifier produced by hashPlatformToken; never a raw token. */
  tokenHash: string;
  /** Explicit workspace IDs, or ["*"] for every workspace. Omission grants none. */
  workspaceIds?: string[];
  enabled?: boolean;
}

export interface PlatformAuthConfig {
  operators?: PlatformOperatorConfig[];
}

export interface PlatformStorageConfig {
  backend?: 'file' | 'sqlite' | 'prisma' | 'memory';
  path?: string;
}

export interface ProviderAgentPolicy {
  /** Whether agent mode (workspace mutation) is allowed for this provider. */
  agentEnabled: boolean;
  /** Default mode when incoming request omits mode: chat | plan | agent */
  defaultMode?: 'chat' | 'plan' | 'agent';
  /** Optional custom comma-separated disallowed tools for chat/read-only mode */
  disallowedTools?: string;
}

export interface BridgeConfig {
  port: number;
  host: string;
  logLevel: 'silent' | 'info' | 'debug';
  apiKeys: ApiKeyConfig;    // API keys for direct API providers
  /** Opaque references persisted instead of provider credential values. */
  apiKeyRefs?: ApiKeyReferenceConfig;
  /** Optional absolute executable overrides for locally installed CLI providers. */
  cliExecutables?: Partial<Record<CliProviderName, string>>;
  securityStorage?: SecurityStorageConfig;
  platformAuth?: PlatformAuthConfig;
  platformStorage?: PlatformStorageConfig;
  orchestrator?: OrchestratorConfig; // optional persisted orchestration policy
  agentPolicies?: Partial<Record<ProviderName, ProviderAgentPolicy>>; // per-provider agent execution policies
  repositories?: Record<string, RepositoryConfig> | RepositoryConfig[]; // repository-specific governance and pipeline assignments
  budget?: BudgetConfig;    // pipeline and model spending limit controls
  lmStudioUrl?: string;     // LM Studio server URL (default http://127.0.0.1:1234)
  rateLimit?: { perMinute: number; maxConcurrent: number };

  // -- Security (all optional, secure-by-default) -----------------------------
  /**
   * CORS allowlist. The request Origin header is reflected back in
   * Access-Control-Allow-Origin ONLY when it appears in this list (the server's
   * own host:port loopback origins are always allowed). Requests without an
   * Origin header (curl, server-side OpenAI clients) are unaffected.
   * Defaults to localhost origins.
   */
  allowedOrigins?: string[];
  /**
   * Optional bearer token for local API auth. When set, every /v1/* endpoint
   * requires an 'Authorization: Bearer <token>' header (401 otherwise).
   * Dashboard HTML is served without a bearer so the page can collect the token.
   * When empty/unset (default), the server behaves exactly as before (no auth).
   */
  authToken?: string;
}

export interface ProviderStatus {
  name: ProviderName;
  connected: boolean;
  models: string[];
  loginType: 'api-key' | 'cli' | 'local';
  credentialSource?: string;
}

export interface BridgeStatus {
  running: boolean;
  port: number;
  version: string;
  providers: ProviderStatus[];
  uptime: number;           // seconds since start
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  /**
   * Reasoning / thinking effort. Accepted from either `effort` or OpenAI-style
   * `reasoning_effort` on the HTTP body. Levels: none | minimal | low | medium |
   * high | xhigh | max (providers that only support a subset map down).
   */
  effort?: string;
  /**
   * Working directory for CLI providers. Ignored by API/LM Studio transports.
   * Must be an absolute path that exists; otherwise the CLI uses an empty sandbox.
   * Required when `mode` is `agent`.
   */
  cwd?: string;
  /**
   * CLI run mode. `chat` (default) is a read-only proxy. `plan` calls each
   * CLI's native plan function. `agent` writes the workspace (requires `cwd`).
   * API/LM Studio transports ignore this. Aliases on the HTTP body: `agentic: true`
   * → agent, `plan: true` → plan.
   */
  mode?: 'chat' | 'plan' | 'agent';
  /** Optional custom comma-separated disallowed tools for chat mode */
  disallowedTools?: string;
  /** Aborted when the downstream HTTP client disconnects. */
  signal?: AbortSignal;
}

export interface ModelDefinition {
  id: string;              // e.g. "cli-grok/grok-4.6"
  provider: ProviderName;
  displayName: string;
  owned_by: string;
  /** How confidently this model is available through the selected transport. */
  availability?: 'verified' | 'documented' | 'dynamic';
  source?: string;
  /**
   * Largest prompt this model's transport accepts, in characters. Set only where
   * a real ceiling exists — `agy` takes the prompt on argv, so it is bounded by
   * the OS command line, while stdin and prompt-file transports are not.
   *
   * The bridge is the only side that knows this: it depends on the binary and
   * the platform, not on the model. Without it a client sizes its context off a
   * model's token window (a million for Gemini) and the bridge rejects the
   * request at a fraction of that, which in agent mode kills the loop.
   */
  maxPromptChars?: number;
  /**
   * Token window and output cap.
   *
   * Discovered where a provider reports it — the Codex endpoint returns
   * `context_window`, OpenRouter returns `context_length` — and otherwise taken
   * from the table in model-catalog.ts, which `~/.conduit/models.json` can
   * override without a rebuild.
   *
   * Clients had to keep their own copy of this and it went stale the moment a
   * catalog was discovered rather than pinned. One place, and the bridge is the
   * side that already talks to every provider.
   */
  contextWindow?: number;
  maxOutputTokens?: number;
}

// ── Provider interface — each provider implements this ───────────────────────

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly models: ModelDefinition[];
  /** Credential origin without exposing the credential itself. */
  readonly credentialSource?: string;

  /** Check whether the provider is currently usable. */
  checkSession(): Promise<boolean>;

  /** Refresh credentials or process discovery and report availability. */
  ensureConnected(): Promise<boolean>;

  /** Send a chat message, returns full response */
  chat(req: ChatRequest): Promise<string>;

  /** Send a chat message, yields streamed chunks */
  chatStream(req: ChatRequest): AsyncGenerator<string>;

  /**
   * Optional: claim a model id whose exact match isn't in `models`.
   * Lets passthrough/dynamic providers (OpenRouter, Perplexity, LM Studio, Grok CLI)
   * route "<prefix>/<anything>" without enumerating every model up front.
   */
  ownsModel?(modelId: string): boolean;

  /**
   * Optional: whether a credential is present, checked synchronously.
   * Returning false keeps this provider's models out of `/v1/models`, so the
   * picker never offers a model whose request could only fail on auth.
   * Providers that omit it are always advertised.
   */
  hasCredentials?(): boolean;

  /** Read-only executable/version information for CLI troubleshooting. */
  diagnostics?(): Promise<CliExecutableDiagnostic>;
}

// ── Governance, Repositories, Budgets, and Workspaces ──────────────────────

export interface RepositoryConfig {
  id: string;                    // unique repo key, e.g. "elvatis/conduit-bridge"
  name: string;                  // human-readable label
  path: string;                  // absolute workspace path on disk
  description?: string;
  assignedGovernancePipeline?: string; // default pipeline ID for this repository
  enabledPipelines?: string[];   // allowed pipeline IDs for this repository
  defaultWorkspace?: string;     // default root working directory
  overrides?: {
    disallowedTools?: string;
    agentEnabled?: boolean;
    requireApproval?: boolean;
    maxCostPerRunUsd?: number;
    mandatoryGates?: string[];
  };
  createdAt?: number;
  updatedAt?: number;
}

export interface GovernanceAuditRecord {
  auditId: string;
  timestamp: number;
  pipelineId: string;
  pipelineName: string;
  runId: string;
  stepId: string;
  stepName: string;
  model?: string;
  repository?: string;
  operator: string;
  action: 'approved' | 'rejected';
  feedback?: string;
  correlationId?: string;
}

export interface BudgetConfig {
  maxCostPerRunUsd: number;      // e.g. 0.50
  maxTokensPerRun: number;       // e.g. 50000
  maxDurationMs: number;         // e.g. 120000 ms
  dailyBudgetUsd: number;        // e.g. 10.00
  monthlyBudgetUsd: number;      // e.g. 100.00
  warningThresholdPercent: number; // e.g. 80
  hardStop: boolean;             // reject execution if budget exceeded (true) or warn only (false)
  providerLimits?: Partial<Record<ProviderName, number>>; // daily USD ceiling per provider (UTC)
  modelLimits?: Record<string, number>; // daily USD ceiling per model (UTC)
}

export interface BudgetUsage {
  currentDailyCostUsd: number;
  currentMonthlyCostUsd: number;
  totalRunsToday: number;
  totalTokensToday: number;
  /** Provider invocations, including pipeline steps and retries, distinct from runs. */
  requestAttemptsToday?: number;
  providerDailyCostUsd?: Record<string, number>;
  modelDailyCostUsd?: Record<string, number>;
  lastResetDay: string;          // YYYY-MM-DD
  lastResetMonth: string;        // YYYY-MM
}

/** Optional remote GitHub Projects v2 association for a local workspace. */
export interface GitHubProjectLink {
  projectId: string;
  projectUrl: string;
  /** Organization or user login owning the project. */
  org: string;
  /** Optional owner/repository used by the GitHub Actions tool. */
  repo?: string;
}

export interface WorkspaceEntry {
  id: string;
  path: string;
  name: string;
  lastUsed: number;
  isDefault?: boolean;
  exists?: boolean;
  writable?: boolean;
  githubProject?: GitHubProjectLink;
}

export type ToolSecurityRisk = 'low' | 'medium' | 'high' | 'critical';

export type ToolClassification =
  | 'Read Only'
  | 'Workspace Modify'
  | 'System Modify'
  | 'Network Access'
  | 'External Service';

