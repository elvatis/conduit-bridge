// ── Public types for conduit-bridge ──────────────────────────────────────────

export type ProviderName =
  | 'grok' | 'claude' | 'gemini' | 'chatgpt'
  | 'claude-api' | 'gemini-api' | 'codex-api'
  | 'openrouter-api' | 'perplexity-api'   // OpenAI-compatible API aggregators
  | 'lmstudio'                             // local OpenAI-compatible server
  | 'grok-cli';                            // local Grok CLI subprocess

export interface ApiKeyConfig {
  'claude-api'?: string;        // Anthropic API key
  'gemini-api'?: string;        // Google AI API key
  'codex-api'?: string;         // OpenAI API key
  'openrouter-api'?: string;    // OpenRouter API key (sk-or-v1-…)
  'perplexity-api'?: string;    // Perplexity API key (pplx-…)
}

export interface BridgeConfig {
  port: number;
  host: string;
  profileBaseDir: string;   // e.g. ~/.conduit/profiles
  headless: boolean;        // false = visible browser (for login)
  logLevel: 'silent' | 'info' | 'debug';
  apiKeys: ApiKeyConfig;    // API keys for CLI/SDK-based providers
  lmStudioUrl?: string;     // LM Studio server URL (default http://127.0.0.1:1234)

  // ── Security (all optional, secure-by-default) ─────────────────────────────
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
   * When empty/unset (default), the server behaves exactly as before (no auth).
   */
  authToken?: string;
  /**
   * Opt-in to launch Chromium with '--no-sandbox'. Default false, so the
   * Chromium sandbox stays ON. Only enable this for environments that require
   * it (e.g. running as root inside a container). Can also be enabled via the
   * CONDUIT_NO_SANDBOX=1 environment variable.
   */
  chromiumNoSandbox?: boolean;
}

// ── Session expiry tracking (T-004) ──────────────────────────────────────────
// active        = a valid logged-in session was verified
// expired       = provider was logged in before but the session has lapsed
//                 (redirected to a login page / verify selector disappeared)
// unknown       = session has not been verified yet this run
// not_applicable = API-key provider (no browser session to expire)
export type SessionStatus = 'active' | 'expired' | 'unknown' | 'not_applicable';

export interface SessionInfo {
  loggedIn: boolean;           // currently holds a valid logged-in session
  lastVerified: number | null; // epoch ms of the last verified-good login
  status: SessionStatus;
}

export interface ProviderStatus {
  name: ProviderName;
  connected: boolean;
  hasProfile: boolean;      // profile directory exists on disk
  sessionValid: boolean;    // browser context is alive + verified
  models: string[];
  cookieExpiresAt?: Date;
  // ── Session expiry tracking (T-004): additive, backward compatible ──
  loginType?: 'browser' | 'api-key'; // browser-login vs API-key provider
  session?: SessionInfo;             // per-provider session validity/expiry
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

  /** Ensure connected - restore session from profile if not connected */
  ensureConnected(): Promise<boolean>;

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

  /**
   * Optional: claim a model id whose exact match isn't in `models`.
   * Lets passthrough/dynamic providers (OpenRouter, Perplexity, LM Studio, Grok CLI)
   * route "<prefix>/<anything>" without enumerating every model up front.
   */
  ownsModel?(modelId: string): boolean;
}
