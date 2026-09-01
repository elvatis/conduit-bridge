// ── Public types for conduit-bridge ──────────────────────────────────────────
import type { OrchestratorConfig } from './orchestrator.js';

export type ProviderName =
  | 'claude-api' | 'gemini-api' | 'codex-api'
  | 'openrouter-api' | 'perplexity-api'   // OpenAI-compatible API aggregators
  | 'lmstudio'                             // local OpenAI-compatible server
  | 'cli-grok'                             // local Grok CLI (x.ai/build, binary: grok)
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
  logLevel: 'silent' | 'info' | 'debug';
  apiKeys: ApiKeyConfig;    // API keys for direct API providers
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
}
