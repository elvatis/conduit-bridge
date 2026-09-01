// ── Public types for conduit-bridge ──────────────────────────────────────────
import type { OrchestratorConfig } from './orchestrator.js';
import type { LoginDiagnostics, LoginMode, LoginSnapshot, LoginTimings } from './login/state.js';

export type { LoginState, LoginSnapshot, LoginDiagnostics, LoginMode, LoginTimings, ChallengeKind } from './login/state.js';

export type ProviderName =
  | 'grok' | 'claude' | 'gemini' | 'chatgpt' | 'perplexity'
  | 'claude-api' | 'gemini-api' | 'codex-api'
  | 'openrouter-api' | 'perplexity-api'   // OpenAI-compatible API aggregators
  | 'lmstudio'                             // local OpenAI-compatible server
  | 'grok-cli'                             // local Grok CLI (x.ai/build, binary: grok)
  | 'cli-codex'                            // @openai/codex (binary: codex)
  | 'cli-claude'                           // @anthropic-ai/claude-code (binary: claude)
  | 'cli-gemini';                           // Antigravity CLI (binary: agy)

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
  orchestrator?: OrchestratorConfig; // optional persisted orchestration policy
  lmStudioUrl?: string;     // LM Studio server URL (default http://127.0.0.1:1234)
  rateLimit?: { perMinute: number; maxConcurrent: number };

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
   * Opt out of the Chromium OS sandbox. Default false, so the bridge asks for
   * the sandbox and only falls back — reporting the downgrade once — when the
   * host cannot honour it (hardened Linux hosts commonly restrict the
   * unprivileged user namespaces Chromium needs). Set this for environments
   * that genuinely require it, e.g. running as root inside a container. Can
   * also be enabled via the CONDUIT_NO_SANDBOX=1 environment variable.
   */
  chromiumNoSandbox?: boolean;

  /** Interactive browser-login behaviour. All fields optional. */
  login?: LoginConfig;
  /** Local desktop browser selection. Defaults to the detected browser/profile. */
  browser?: {
    executablePath?: string;
    userDataDir?: string;
    useDefaultProfile?: boolean;
  };
}

// ── Interactive browser login (issue: provider security verification) ────────

export interface LoginConfig {
  /**
   * How the visible login browser is started.
   *
   * 'handoff'  (default) starts an ordinary browser process, attaches only
   *            after launch, and exposes its page through the built-in viewer
   *            on port 31338. navigator.webdriver remains false.
   * 'assisted' drives the login browser through Playwright. Richer live
   *            diagnostics, but the browser discloses that it is automated and
   *            several providers refuse to complete a sign-in in that mode.
   */
  mode?: LoginMode;
  /**
   * Deprecated compatibility flag. Restore now always uses the browser's
   * native identity and never applies a User-Agent override.
   */
  honestRestoreIdentity?: boolean;
  /** Window size for the visible login browser. */
  windowSize?: { width: number; height: number };
  /** Time budgets for one attempt. Omitted fields use the defaults. */
  timings?: Partial<LoginTimings>;
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
  /** Latest interactive-login snapshot, when one has been attempted this run. */
  login?: LoginSnapshot;
  /**
   * Why the last session restore did not produce a signed-in session, already
   * sanitized. Never contains a cookie, token or query string.
   */
  lastLoginDiagnostics?: LoginDiagnostics;
}

export interface BridgeStatus {
  running: boolean;
  port: number;
  version: string;
  providers: ProviderStatus[];
  uptime: number;           // seconds since start
  /**
   * True while saved browser sessions are still being restored. Until this
   * clears, a browser provider reporting "not signed in" may simply not have
   * been checked yet.
   */
  restoringSessions?: boolean;
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
  /** Aborted when the downstream HTTP client disconnects. */
  signal?: AbortSignal;
}

export interface ModelDefinition {
  id: string;              // e.g. "web-grok/grok-3"
  provider: ProviderName;
  displayName: string;
  owned_by: string;
  /** How confidently this model is available through the selected transport. */
  availability?: 'verified' | 'documented' | 'dynamic';
  source?: string;
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

  /**
   * Optional: the observable-login surface used by LoginSessionManager.
   * Implemented by browser providers; absent on API-key and CLI providers.
   */
  loginDriver?(): import('./login/session-manager.js').LoginDriver;
  /** Optional: true while an interactive login is running for this provider. */
  readonly loginActive?: boolean;
  /** JPEG frame used by the built-in browser-login viewer. */
  captureLoginFrame?(): Promise<Buffer | null>;
  /** Applies one validated viewer input event to the active login page. */
  dispatchLoginInput?(input: import('./login/viewer.js').LoginViewerInput): Promise<boolean>;

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
