// ============================================================================
// Network-layer response interception (issue #35 / AAHP T-005)
// ============================================================================
//
// Historically each web provider captured model output by polling DOM
// selectors, which is brittle: the moment a provider ships new markup, the
// selector stops matching and the response comes back empty. This module adds
// a provider-agnostic capability that captures the assistant text from the
// browser NETWORK layer instead, using Playwright's native `page.on('response')`
// event. That is immune to markup changes and does not rely on monkeypatching
// the page's own `window.fetch` (which a site can detect or bypass).
//
// Design contract (see also src/providers/base.ts):
//   * `NetworkCapture` is the PRIMARY, robust capture path. It observes the
//     provider's backend streaming endpoint and, once that response finishes,
//     parses the assistant text out of the raw SSE / chunked body.
//   * `streamMerged` drives a provider's `chatStream`: it interleaves the
//     network capture with the provider's existing in-page incremental reader
//     (kept purely for smooth token-by-token streaming) and, only if BOTH
//     capture nothing, hands off to the DOM-polling FALLBACK.
//
// This file is intentionally self-contained so that parallel PRs which also
// touch base.ts do not collide on the interception logic.
//
// IMPORTANT (live-site verification): the per-provider endpoint patterns and
// stream shapes below are reconstructed from the existing in-page interceptors
// and public reverse-engineering notes. They MUST be confirmed against the real
// sites while logged in before this path is trusted in production. Each spec is
// annotated `VERIFIED` or `ASSUMED` accordingly.

import type { Page, Response } from 'playwright';
import { logger } from '../logger.js';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

/** How to recognise and parse a provider's backend streaming endpoint. */
export interface InterceptSpec {
  /** Human label used in logs. */
  label: string;
  /** Return true if this response URL is the provider's completion stream. */
  match(url: string): boolean;
  /**
   * Parse the FULL decoded response body (all SSE / chunk lines concatenated)
   * and return the best assistant text found. Return '' when nothing matched.
   */
  parse(body: string): string;
}

/** Shape read back from a provider's in-page incremental reader. */
export interface InPageState {
  text: string;
  done: boolean;
  [key: string]: unknown;
}

export interface MergedStreamOptions {
  /** Provider name for log lines. */
  provider: string;
  /** The armed network capture (primary path). */
  capture: NetworkCapture;
  /** Reads the provider's in-page `window.__conduit*` incremental buffer. */
  readInPage: () => Promise<InPageState>;
  /** DOM selector polling, used only if the network layer captured nothing. */
  domFallback?: () => AsyncGenerator<string>;
  /** Overall budget in ms (default 120000). */
  timeout?: number;
  /** Poll cadence in ms (default 400). */
  pollInterval?: number;
  /** Consecutive unchanged polls that count as "complete" (default 4). */
  stableTicks?: number;
  /** Called every tick with the raw in-page state (e.g. Claude metadata). */
  onTick?: (state: InPageState) => void;
}

// ----------------------------------------------------------------------------
// NetworkCapture: primary, Playwright-native interception
// ----------------------------------------------------------------------------

/**
 * Observes `page.on('response')` and, for the response whose URL matches the
 * provider spec, buffers the completed body and parses the assistant text.
 *
 * `response.body()` resolves only once the streamed response has finished, so
 * this path is a completion-accurate BACKSTOP rather than an incremental
 * streamer. Smooth token streaming is still provided by the provider's in-page
 * reader; this capture guarantees a correct, complete result even if that
 * in-page hook is bypassed or the DOM changes.
 */
export class NetworkCapture {
  private _text = '';
  private _done = false;
  private _armed = false;
  private _sawMatch = false;
  private readonly _handler: (response: Response) => void;

  constructor(
    private readonly _page: Page,
    private readonly _spec: InterceptSpec,
    private readonly _providerName: string,
  ) {
    this._handler = (response: Response) => {
      // Fire-and-forget; body() is awaited inside.
      void this._onResponse(response);
    };
    this._page.on('response', this._handler);
  }

  /** Begin a fresh capture. Call immediately before sending a message. */
  arm(): void {
    this._text = '';
    this._done = false;
    this._sawMatch = false;
    this._armed = true;
  }

  /** Best assistant text captured so far (empty until the stream completes). */
  get text(): string {
    return this._text;
  }

  /** True once a matching backend response has fully arrived and parsed. */
  get done(): boolean {
    return this._done;
  }

  /** True if a URL matching the spec was seen (even if it parsed to empty). */
  get sawMatch(): boolean {
    return this._sawMatch;
  }

  /** Stop listening. Always call this in a `finally` after streaming. */
  detach(): void {
    this._armed = false;
    try {
      this._page.off('response', this._handler);
    } catch {
      // page may already be closed; nothing to clean up.
    }
  }

  private async _onResponse(response: Response): Promise<void> {
    if (!this._armed) return;
    let url = '';
    try {
      url = response.url();
    } catch {
      return;
    }
    if (!this._spec.match(url)) return;
    this._sawMatch = true;

    try {
      // Resolves when the streamed backend response has fully downloaded.
      const buf = await response.body();
      const parsed = this._spec.parse(buf.toString('utf8'));
      if (parsed && parsed.length > this._text.length) {
        this._text = parsed;
      }
      // Mark done once we have a parseable completion; if the matching
      // response yielded nothing usable, leave `done` false so the provider
      // keeps streaming from the in-page reader / DOM fallback instead.
      if (this._text.length > 0) {
        this._done = true;
        logger.debug(
          `[${this._providerName}] network capture complete via ${this._spec.label} (${this._text.length} chars)`,
        );
      }
    } catch {
      // response.body() can throw for redirects or already-consumed bodies;
      // that is non-fatal, the provider falls through to its other paths.
    }
  }
}

// ----------------------------------------------------------------------------
// streamMerged: primary capture + incremental reader, DOM polling as fallback
// ----------------------------------------------------------------------------

/**
 * Drive a provider's `chatStream`. Yields assistant-text deltas, preferring
 * whichever source (network capture or in-page reader) has reconstructed more
 * of the message. Both sources parse the identical backend byte stream, so the
 * longer one is always a superset prefix and length is a safe progress metric
 * (this mirrors the single-source polling the providers used before).
 *
 * If neither source produces any text within the budget, the DOM-polling
 * fallback runs so behaviour never regresses below the old selector approach.
 */
export async function* streamMerged(opts: MergedStreamOptions): AsyncGenerator<string> {
  const {
    provider,
    capture,
    readInPage,
    domFallback,
    onTick,
    timeout = 120000,
    pollInterval = 400,
    stableTicks = 4,
  } = opts;

  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;
  let hasContent = false;

  while (Date.now() - start < timeout) {
    await delay(pollInterval);

    const inPage = await readInPage().catch(() => ({ text: '', done: false }) as InPageState);
    if (onTick) onTick(inPage);

    const nativeText = capture.text;
    const inPageText = typeof inPage.text === 'string' ? inPage.text : '';
    // Prefer the longer reconstruction. Native usually stays empty until the
    // backend stream finishes, then jumps to the full text; in-page provides
    // the smooth intermediate deltas.
    const text = nativeText.length >= inPageText.length ? nativeText : inPageText;
    const done = capture.done || inPage.done === true;

    if (!text && !hasContent) {
      if (done) break;
      continue;
    }

    if (text.length > lastLength) {
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
      hasContent = true;
    } else if (done) {
      logger.debug(`[${provider}] stream complete via network interception (${lastLength} chars)`);
      return;
    } else {
      stableCount++;
      if (stableCount >= stableTicks && lastLength > 0) {
        logger.debug(`[${provider}] response stable (${lastLength} chars)`);
        return;
      }
    }
  }

  if (lastLength === 0) {
    if (domFallback) {
      logger.info(`[${provider}] network interception captured nothing, falling back to DOM polling...`);
      yield* domFallback();
    } else {
      logger.warn(`[${provider}] response capture timed out with no content`);
    }
  } else {
    logger.warn(`[${provider}] response capture timed out (${lastLength} chars streamed)`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ----------------------------------------------------------------------------
// Stream parsers (pure, unit-testable) + per-provider intercept specs
// ----------------------------------------------------------------------------
//
// Each parser takes the FULL decoded body and returns the best assistant text.
// They are exported so they can be tested without a live browser.

function longer(a: string, b: string): string {
  return a.length >= b.length ? a : b;
}

/** Iterate `data: {json}` SSE payloads out of a raw body. */
function* sseData(body: string): Generator<string> {
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(line.indexOf(':') + 1).trim();
    if (!raw || raw === '[DONE]') continue;
    yield raw;
  }
}

/**
 * ChatGPT: `/backend-api/conversation` SSE.
 * VERIFIED endpoint (issue #23 reporter referenced this SSE target); the exact
 * event shapes below still need a logged-in confirmation, especially the newer
 * incremental "append" op format ChatGPT has been rolling out.
 */
export function parseChatGPTStream(body: string): string {
  let cumulative = ''; // message.content.parts is sent whole each event
  let delta = ''; // OpenAI-compatible delta accumulation
  for (const raw of sseData(body)) {
    let d: any;
    try {
      d = JSON.parse(raw);
    } catch {
      continue;
    }
    const parts = d?.message?.content?.parts;
    if (Array.isArray(parts)) {
      const t = parts.filter((p: unknown) => typeof p === 'string').join('');
      cumulative = longer(cumulative, t);
    }
    const dc = d?.choices?.[0]?.delta?.content;
    if (typeof dc === 'string') delta += dc;
    const mc = d?.choices?.[0]?.message?.content;
    if (typeof mc === 'string') cumulative = longer(cumulative, mc);
  }
  return longer(cumulative, delta);
}

/**
 * Claude (claude.ai): completion SSE, Anthropic event shape.
 * ASSUMED endpoint `/completion` (and `chat_conversations`); the event shape
 * (`content_block_delta` -> `text_delta`) matches the in-page interceptor and
 * the public Anthropic streaming format, but needs live confirmation.
 */
export function parseClaudeStream(body: string): string {
  let text = '';
  for (const raw of sseData(body)) {
    let d: any;
    try {
      d = JSON.parse(raw);
    } catch {
      continue;
    }
    if (d?.type === 'content_block_delta' && d?.delta?.type === 'text_delta') {
      text += d.delta.text ?? '';
    }
    // Some claude.ai builds emit a plain `completion` field per event.
    if (typeof d?.completion === 'string') text += d.completion;
  }
  return text;
}

/**
 * Grok (grok.com): `/rest/app-chat/conversations/.../responses` streaming JSON.
 * ASSUMED endpoint + shape. Grok streams newline-delimited JSON (not always
 * `data:`-prefixed), so we parse both raw JSONL and SSE lines here.
 */
export function parseGrokStream(body: string): string {
  let acc = ''; // token-by-token accumulation
  let whole = ''; // full-response snapshots
  for (const line of body.split('\n')) {
    let raw = line.trim();
    if (!raw) continue;
    if (raw.startsWith('data:')) raw = raw.slice(raw.indexOf(':') + 1).trim();
    if (!raw || raw === '[DONE]') continue;
    let d: any;
    try {
      d = JSON.parse(raw);
    } catch {
      continue;
    }
    const dc = d?.choices?.[0]?.delta?.content;
    if (typeof dc === 'string') acc += dc;
    const resp = d?.result?.response;
    if (typeof resp === 'string') whole = longer(whole, resp);
    if (typeof resp?.token === 'string') acc += resp.token;
    if (typeof d?.token === 'string') acc += d.token;
    const msg = d?.modelResponse?.message;
    if (typeof msg === 'string') whole = longer(whole, msg);
  }
  return longer(whole, acc);
}

/**
 * Gemini (gemini.google.com): batchexecute / StreamGenerate.
 * ASSUMED and the LEAST certain of the four. Gemini's transport is an obfuscated
 * `batchexecute` RPC returning nested JSON arrays, not clean SSE. We first try
 * SSE candidate shapes, then fall back to a longest-embedded-string heuristic
 * (same approach as the in-page reader). This especially needs live verification.
 */
export function parseGeminiStream(body: string): string {
  // Strategy 1: SSE candidate / OpenAI-compatible shapes.
  let sse = '';
  for (const raw of sseData(body)) {
    let d: any;
    try {
      d = JSON.parse(raw);
    } catch {
      continue;
    }
    const dc = d?.choices?.[0]?.delta?.content;
    if (typeof dc === 'string') sse += dc;
    const cand = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof cand === 'string') sse = longer(sse, cand);
  }
  if (sse) return sse;

  // Strategy 2: longest embedded JSON string (batchexecute nested arrays).
  const matches = body.match(/"((?:[^"\\]|\\.){20,})"/g);
  if (!matches) return '';
  let longest = '';
  for (const m of matches) {
    const s = m.slice(1, -1);
    if (s.startsWith('http')) continue; // skip URLs / opaque ids
    // Decode JSON string escapes in one correct pass. This handles \n, \t, \",
    // \\ and \uXXXX together: an ordered replace chain mis-decodes an escaped
    // backslash followed by n/t (\\n -> backslash+newline), and \uXXXX text was
    // being dropped entirely.
    let decoded: string;
    try {
      decoded = JSON.parse(`"${s}"`);
    } catch {
      continue; // not a well-formed JSON string body
    }
    if (decoded.length > longest.length) longest = decoded;
  }
  return longest;
}

// Per-provider specs. `match` is deliberately tighter than the broad in-page
// hooks so the native capture locks onto the real completion endpoint.

export const CHATGPT_INTERCEPT: InterceptSpec = {
  label: 'chatgpt:/backend-api/conversation', // VERIFIED (issue #23)
  match: url => url.includes('/backend-api/conversation') || url.includes('/backend-anon/conversation'),
  parse: parseChatGPTStream,
};

export const CLAUDE_INTERCEPT: InterceptSpec = {
  label: 'claude:/completion', // ASSUMED
  match: url => url.includes('/completion') || url.includes('chat_conversations'),
  parse: parseClaudeStream,
};

export const GROK_INTERCEPT: InterceptSpec = {
  label: 'grok:/rest/app-chat/conversations', // ASSUMED
  match: url =>
    url.includes('/rest/app-chat/conversations/') ||
    url.includes('/responses') ||
    url.includes('add-response'),
  parse: parseGrokStream,
};

export const GEMINI_INTERCEPT: InterceptSpec = {
  label: 'gemini:StreamGenerate/batchexecute', // ASSUMED (needs verification)
  match: url =>
    url.includes('StreamGenerate') ||
    url.includes('batchexecute') ||
    url.includes('assistant.lamda') ||
    url.includes('BardFrontendService'),
  parse: parseGeminiStream,
};
