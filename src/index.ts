// Public API for conduit-bridge (used by conduit-vscode extension)
export { BridgeServer } from './server.js';
export { ProviderRegistry, createSkillRegistry } from './registry.js';
export {
  loadConfig,
  saveConfig,
  loadDotEnv,
  runtimeDir,
  parseConfigValue,
  bearerAuthorization,
  storeApiCredential,
  deleteApiCredential,
  resolveSecretReference,
  secureStorageStatus,
} from './config.js';
export {
  createContentCipher,
  openSecretVault,
  isSecretReference,
  SecureStorageUnavailableError,
} from './secrets.js';
export {
  authenticatePlatformOperator,
  createPlatformOperatorCredential,
  hashPlatformToken,
  platformCapabilityAllowed,
  requirePlatformCapability,
  PlatformAuthorizationError,
} from './platform-auth.js';
export { logger, configureLogger } from './logger.js';
export {
  pickEffort,
  parseEffort,
  toOpenAiEffort,
  toClaudeEffort,
  toAgyEffort,
  toGrokEffort,
} from './effort.js';
export type {
  BridgeConfig,
  BridgeStatus,
  ProviderStatus,
  ProviderName,
  CliProviderName,
  CliExecutableDiagnostic,
  SecretReference,
  SecurityStorageConfig,
  PlatformAuthConfig,
  PlatformOperatorConfig,
  PlatformRole,
  PlatformStorageConfig,
  ChatMessage,
  ChatRequest,
  ModelDefinition,
  ProviderAdapter,
  WorkspaceEntry,
  GitHubProjectLink,
} from './types.js';
export {
  SUPPORTED_DESKTOP_PLATFORMS,
  platformSupport,
  assertSupportedPlatform,
} from './platform.js';
export type { PlatformSupport, SupportedDesktopPlatform } from './platform.js';
export { TransactionalStateStore, FileSnapshotBackend, SqliteSnapshotBackend, PrismaSnapshotBackend, MemorySnapshotBackend, StorageConflictError } from './storage.js';
export type { StateStore, StateTransaction, SnapshotBackend, SnapshotCodec, PrismaStateClient } from './storage.js';
export { PlatformContentService } from './platform-content.js';
export { PlatformCatalogService, BUILTIN_SKILLS, BUILTIN_PROMPTS } from './platform-catalog.js';
export { PlatformRunService } from './platform-runs.js';
export { PlatformProfileService } from './platform-profiles.js';
export { SkillRegistry, SkillError, validateSkillInput } from './skills/index.js';
export type { SkillDefinition, SkillExecutionContext, SkillEffect, SkillSchema } from './skills/index.js';
export { filesystemSkill, resolveSkillPath, searchInWorkspace } from './skills/filesystem.js';
export { browserSkill, isPublicWebAddress, publicPageUrl } from './skills/browser.js';
export { sandboxSkill, commandEnvironment } from './skills/sandbox.js';
export { memorySkill, DailyMemory } from './skills/memory.js';
export type { DailyMemoryEntry } from './skills/memory.js';
export { webSearchSkill } from './skills/web-search.js';
export { githubActionsSkill } from './skills/github-actions.js';
export { GitHubApi, GitHubApiError } from './github-api.js';
export type { GitHubApiOptions } from './github-api.js';
export { GitHubProjectsProvider } from './providers/github-projects.js';
export type { GitHubProject, GitHubProjectItem, GitHubPage, GitHubPageInput, GitHubProjectFieldValue } from './providers/github-projects.js';
export { IntegrationApi } from './integration-api.js';
export type { IntegrationApiDependencies } from './integration-api.js';
export * from './vscode-bridge.js';
export * from './ui/index.js';
export * from './ui/tooltips.js';
export * from './rate-limiter.js';
export * from './session-registry.js';
export * from './orchestrator.js';
export * from './skills/prompt-splitter.js';
export * from './skills/split-execute.js';
export * from './skills/routing-rules.js';
export * from './skills/code-search.js';
export * from './skills/notify.js';
export * from './providers/bitnet.js';
export * from './providers/llama-server.js';
export { LmStudioProvider, ThinkTagFilter, stripThinkTags } from './providers/lmstudio.js';
