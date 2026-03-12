// ── Public types for conduit-bridge ──────────────────────────────────────────

export type ProviderName = 'grok' | 'claude' | 'gemini' | 'chatgpt';

export interface BridgeConfig {
  port: number;
  host: string;
  profileBaseDir: string;   // e.g. ~/.conduit/profiles
  headless: boolean;        // false = visible browser (for login)
  logLevel: 'silent' | 'info' | 'debug';
}

export interface ProviderStatus {
  name: ProviderName;
  connected: boolean;
  hasProfile: boolean;      // profile directory exists on disk
  sessionValid: boolean;    // browser context is alive + verified
  models: string[];
  cookieExpiresAt?: Date;
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
}

export interface ModelDefinition {
  id: string;              // e.g. "web-grok/grok-3"
  provider: ProviderName;
  displayName: string;
  owned_by: string;
}

// ── Provider interface — each provider implements this ───────────────────────

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly models: ModelDefinition[];

  /** Check if the browser session is alive and logged in */
  checkSession(): Promise<boolean>;

  /** Launch browser + open login page (headful, user logs in manually) */
  login(onReady: (loginUrl: string) => void): Promise<void>;

  /** Close browser context */
  logout(): Promise<void>;

  /** Send a chat message, returns full response */
  chat(req: ChatRequest): Promise<string>;

  /** Send a chat message, yields streamed chunks */
  chatStream(req: ChatRequest): AsyncGenerator<string>;

  /** Restore session from saved profile (called on startup) */
  restoreSession(): Promise<boolean>;
}
