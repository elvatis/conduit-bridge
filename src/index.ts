// Public API for conduit-bridge (used by conduit-vscode extension)
export { BridgeServer } from './server.js';
export { ProviderRegistry } from './registry.js';
export { loadConfig, saveConfig } from './config.js';
export { logger, configureLogger } from './logger.js';
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
