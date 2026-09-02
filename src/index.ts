// Public API for conduit-bridge (used by conduit-vscode extension)
export { BridgeServer } from './server.js';
export { ProviderRegistry } from './registry.js';
export { loadConfig, saveConfig, loadDotEnv, runtimeDir, parseConfigValue, bearerAuthorization } from './config.js';
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
