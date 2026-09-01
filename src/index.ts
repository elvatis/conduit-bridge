// Public API for conduit-bridge (used by conduit-vscode extension)
export { BridgeServer } from './server.js';
export { ProviderRegistry } from './registry.js';
export { loadConfig, saveConfig, loadDotEnv } from './config.js';
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
  SessionInfo,
  SessionStatus,
  ProviderName,
  ChatMessage,
  ChatRequest,
  ModelDefinition,
  ProviderAdapter,
  LoginConfig,
} from './types.js';
export type {
  LoginState,
  LoginSnapshot,
  LoginDiagnostics,
  LoginMode,
  LoginTimings,
  ChallengeKind,
} from './login/state.js';
export { LOGIN_STATES, TERMINAL_LOGIN_STATES, isTerminalLoginState, canTransition } from './login/state.js';
export { probeDisplay } from './login/display.js';
export type { DisplayProbe } from './login/display.js';
export { loginViewerUrl } from './login/viewer.js';
export type { LoginViewerInput } from './login/viewer.js';
