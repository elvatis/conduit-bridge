// ── Provider security-check DETECTION ────────────────────────────────────────
//
// Conduit observes whether a provider is showing a security check so it can
// say so plainly and hand control to the person. It never solves, clicks,
// suppresses, replays or works around one. Nothing in this file modifies a
// page, forges a header, or hides an automation signal.
//
// The classifiers are pure functions over already-collected observations so
// they can be unit-tested without a browser.

import type { ChallengeKind } from './state.js';

export type PageVerdict =
  /** Nothing challenge-like observed. */
  | 'ok'
  /** A transient interstitial is on screen; it may clear on its own. */
  | 'verifying'
  /** A security check is up and needs the person. */
  | 'challenge_detected'
  /** The provider refused this browser/network outright. */
  | 'blocked';

export interface ChallengeVerdict {
  verdict: PageVerdict;
  kind?: ChallengeKind;
  /** Cloudflare ray id: an opaque support reference. Never a credential. */
  rayId?: string;
  /** Short, sanitized explanation of what was observed. */
  signal?: string;
}

const OK: ChallengeVerdict = { verdict: 'ok' };

/** Cloudflare hard-refusal codes that mean "do not retry". */
const CF_BLOCK_CODES = [1006, 1007, 1008, 1015, 1020];

function header(headers: Record<string, string>, name: string): string {
  // Playwright lower-cases response header names, but be defensive.
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  const found = Object.keys(headers).find(k => k.toLowerCase() === name);
  return found ? String(headers[found] ?? '') : '';
}

/**
 * Classify a top-level or sub-resource response by status + headers alone.
 *
 * `cf-mitigated: challenge` is the primary signal: it is vendor-documented,
 * challenge-type agnostic, and appears on XHRs as well as navigations — which
 * matters because Claude's interstitial arrives on the site's own XHR, not on
 * the initial document.
 */
export function classifyResponse(
  status: number,
  headers: Record<string, string> = {},
  opts: { isDocument?: boolean } = {},
): ChallengeVerdict {
  const mitigated = header(headers, 'cf-mitigated').toLowerCase();
  const rayId = header(headers, 'cf-ray').split('-')[0] || undefined;
  const server = header(headers, 'server').toLowerCase();

  // The mitigation header is unambiguous and is what the provider's own XHRs
  // carry, so it counts wherever it appears.
  if (mitigated === 'challenge') {
    return { verdict: 'challenge_detected', kind: 'cloudflare_managed', rayId, signal: 'cf-mitigated: challenge' };
  }

  // A bare status is not: an image or API call can 403 on a perfectly healthy
  // signed-in page. Only a refusal of the page itself means the person is shut
  // out, so this is confined to the top-level document.
  if (opts.isDocument && (status === 403 || status === 503) && (server.includes('cloudflare') || rayId)) {
    return { verdict: 'blocked', kind: 'cloudflare_block', rayId, signal: `HTTP ${status} from the provider's edge` };
  }

  return { ...OK, rayId };
}

// ── DOM observation ──────────────────────────────────────────────────────────

/**
 * A snapshot of the observable markers on a page. Collected by
 * `evaluateChallengeMarkers` and classified by `classifyDom`.
 *
 * `bodyTextSample` is used only for matching; it is never logged, stored or
 * returned to a client.
 */
export interface DomMarkers {
  title: string;
  host: string;
  /** Cloudflare's challenge bootstrap object is present on the page. */
  hasChallengeRuntime: boolean;
  /** The hidden turnstile response field a managed challenge injects. */
  hasChallengeResponseInput: boolean;
  /** A challenge widget iframe that is actually visible (needs a click). */
  visibleChallengeWidget: boolean;
  bodyTextSample: string;
}

const INTERSTITIAL_TITLES = [
  'just a moment',
  'attention required',
  'access denied',
  'security check',
  'checking your browser',
];

const INTERSTITIAL_BODY = [
  'performing security verification',
  'verifying you are human',
  'verify you are human',
  'verifies you are not a bot',
  'checking your browser before accessing',
  'this website uses a security service to protect',
];

const BLOCK_BODY = [
  'sorry, you have been blocked',
  'you are unable to access',
  'access to this page has been denied',
];

/** Google refuses sign-in in browsers it considers automated or unsafe. */
const GOOGLE_REFUSAL_BODY = [
  "couldn't sign you in",
  'this browser or app may not be secure',
  'try using a different browser',
];

/**
 * Normalise the apostrophe variants pages actually render (U+2019, U+02BC and
 * a stray backtick) to ASCII, so a marker list stays readable and still
 * matches. Google's sign-in refusal uses the typographic form.
 */
function normalizeText(value: string): string {
  return (value ?? '').replace(/[\u2018\u2019\u02BC\u0060]/g, "'");
}

function includesAny(haystack: string, needles: readonly string[]): string | undefined {
  const normalized = normalizeText(haystack);
  return needles.find(n => normalized.includes(n));
}

/** Classify a collected DOM snapshot. Pure. */
export function classifyDom(m: DomMarkers): ChallengeVerdict {
  const title = (m.title ?? '').toLowerCase();
  const body = (m.bodyTextSample ?? '').toLowerCase();
  const host = (m.host ?? '').toLowerCase();

  // Google's sign-in refusal is not a Cloudflare challenge and must not be
  // reported as one — the remedy is completely different.
  const isGoogleHost = host === 'accounts.google.com' || host.endsWith('.accounts.google.com');
  if (isGoogleHost) {
    const hit = includesAny(body, GOOGLE_REFUSAL_BODY);
    if (hit) return { verdict: 'blocked', kind: 'google_untrusted_browser', signal: 'Google declined the sign-in' };
  }

  // A block page is short and is served INSTEAD of the product. Requiring both
  // a block phrase and a Cloudflare error code keeps a signed-in page that
  // merely quotes one of these phrases — a chat transcript, a search result —
  // from being read as a refusal.
  const blockHit = includesAny(body, BLOCK_BODY);
  const codeHit = /error code:?\s*(\d{4})/i.exec(m.bodyTextSample ?? '');
  const blockedCode = codeHit ? Number(codeHit[1]) : null;
  const looksLikeBlockPage = (m.bodyTextSample ?? '').length < 1200;
  if ((blockHit && looksLikeBlockPage) || (blockedCode !== null && CF_BLOCK_CODES.includes(blockedCode) && looksLikeBlockPage)) {
    return {
      verdict: 'blocked',
      kind: 'cloudflare_block',
      signal: blockedCode !== null ? `provider error code ${blockedCode}` : 'the provider returned a block page',
    };
  }

  if (m.visibleChallengeWidget) {
    return { verdict: 'challenge_detected', kind: 'cloudflare_interactive', signal: 'an interactive security check is on screen' };
  }

  const titleHit = includesAny(title, INTERSTITIAL_TITLES);
  const bodyHit = includesAny(body, INTERSTITIAL_BODY);
  if (m.hasChallengeRuntime || m.hasChallengeResponseInput || titleHit || bodyHit) {
    return { verdict: 'verifying', kind: 'cloudflare_managed', signal: 'a security check is running' };
  }

  return OK;
}

/**
 * Classify by window title alone.
 *
 * Used by the handoff login mode, where the browser is an ordinary process
 * with no automation attached: the only thing Conduit observes is the title of
 * the window already visible to the person on the shared display.
 */
export function classifyWindowTitle(rawTitle: string): ChallengeVerdict {
  const title = (rawTitle ?? '').toLowerCase();
  if (!title) return OK;
  if (includesAny(title, GOOGLE_REFUSAL_BODY)) {
    return { verdict: 'blocked', kind: 'google_untrusted_browser', signal: 'Google declined the sign-in' };
  }
  if (includesAny(title, BLOCK_BODY)) {
    return { verdict: 'blocked', kind: 'cloudflare_block', signal: 'the provider returned a block page' };
  }
  if (includesAny(title, INTERSTITIAL_TITLES)) {
    return { verdict: 'verifying', kind: 'cloudflare_managed', signal: 'a security check is running' };
  }
  return OK;
}

/** Rank verdicts so the most serious observation wins when several are merged. */
const SEVERITY: Record<PageVerdict, number> = { ok: 0, verifying: 1, challenge_detected: 2, blocked: 3 };

export function mergeVerdicts(...verdicts: ReadonlyArray<ChallengeVerdict | undefined>): ChallengeVerdict {
  let best: ChallengeVerdict = OK;
  for (const v of verdicts) {
    if (!v) continue;
    if (SEVERITY[v.verdict] > SEVERITY[best.verdict]) {
      // Keep a reference already captured: classifyResponse always sets the
      // rayId key, so a spread would otherwise overwrite it with undefined.
      best = { ...best, ...v, rayId: v.rayId ?? best.rayId };
    } else if (v.rayId && !best.rayId) {
      best = { ...best, rayId: v.rayId };
    }
  }
  return best;
}

// ── Live observation against a Playwright page (assisted / restore paths) ────

/** Minimal shape of the Playwright objects used here, so tests need no browser. */
export interface ObservablePage {
  url(): string;
  /**
   * Evaluated as a source string, matching the idiom used by the providers:
   * the project's tsconfig has no DOM lib, so page code is not type-checked
   * against browser globals.
   */
  evaluate(source: string): Promise<unknown>;
  on(event: 'response', handler: (response: ObservableResponse) => void): void;
  off(event: 'response', handler: (response: ObservableResponse) => void): void;
}

export interface ObservableResponse {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
}

/**
 * Read-only page probe. It observes what a person already sees on the page and
 * changes nothing: no injected globals, no clicks, no navigation.
 */
export const CHALLENGE_MARKER_SOURCE = `(() => {
  const doc = document;
  const widget = Array.from(doc.querySelectorAll('iframe')).some(f => {
    const src = f.src || '';
    return src.indexOf('https://challenges.cloudflare.com/') === 0 && f.clientWidth > 0 && f.clientHeight > 0;
  });
  return {
    title: doc.title || '',
    hasChallengeRuntime: typeof window._cf_chl_opt !== 'undefined',
    hasChallengeResponseInput: !!doc.querySelector('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]'),
    visibleChallengeWidget: widget,
    bodyTextSample: (doc.body ? doc.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 2000)
  };
})()`;

/** Collect the observable markers from a live page. Never modifies the page. */
export async function evaluateChallengeMarkers(page: ObservablePage): Promise<DomMarkers> {
  let host = '';
  try { host = new URL(page.url()).hostname; } catch { host = ''; }

  const collected = await page
    .evaluate(CHALLENGE_MARKER_SOURCE)
    .then(value => value as Partial<DomMarkers> | null)
    .catch(() => null);

  return {
    host,
    title: collected?.title ?? '',
    hasChallengeRuntime: collected?.hasChallengeRuntime ?? false,
    hasChallengeResponseInput: collected?.hasChallengeResponseInput ?? false,
    visibleChallengeWidget: collected?.visibleChallengeWidget ?? false,
    bodyTextSample: collected?.bodyTextSample ?? '',
  };
}

/**
 * Watches every response a page receives for security-check signals.
 *
 * Modelled on NetworkCapture's attach/detach shape (src/providers/interception.ts)
 * but deliberately separate: this one is never armed/disarmed, is not filtered
 * by an InterceptSpec, and reads status + headers, which NetworkCapture does not
 * touch. Response bodies are never read.
 */
export class ChallengeWatcher {
  private _verdict: ChallengeVerdict = OK;
  private _hits = 0;
  private _firstHitAt: number | null = null;
  private readonly _handler: (response: ObservableResponse) => void;

  constructor(private readonly _page: ObservablePage) {
    this._handler = (response) => {
      let result: ChallengeVerdict;
      try {
        // Sub-resources included, so no document-only rules here.
        result = classifyResponse(response.status(), response.headers());
      } catch {
        return;
      }
      if (result.verdict !== 'ok') {
        this._hits++;
        if (this._firstHitAt === null) this._firstHitAt = Date.now();
      }
      this._verdict = mergeVerdicts(this._verdict, result);
    };
    this._page.on('response', this._handler);
  }

  get verdict(): ChallengeVerdict { return this._verdict; }
  get hits(): number { return this._hits; }
  get firstHitAt(): number | null { return this._firstHitAt; }

  /** Forget observations so a fresh navigation starts clean. */
  reset(): void {
    this._verdict = OK;
    this._hits = 0;
    this._firstHitAt = null;
  }

  detach(): void {
    try { this._page.off('response', this._handler); } catch { /* page already gone */ }
  }
}
