// Public API for conduit-bridge (used by conduit-vscode extension)
export { BridgeServer } from './server.js';
export { ProviderRegistry } from './registry.js';
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
