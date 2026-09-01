import { describe, it, expect } from 'vitest';
import {
  classifyResponse,
  classifyDom,
  classifyWindowTitle,
  mergeVerdicts,
  evaluateChallengeMarkers,
  ChallengeWatcher,
  CHALLENGE_MARKER_SOURCE,
  type DomMarkers,
  type ObservablePage,
  type ObservableResponse,
} from '../src/login/challenge.js';

// A real cf-ray is "<opaque hex>-<datacentre>". It is a support reference, not
// a credential, and the classifier only ever keeps the part before the dash.
const CF_RAY = '8f2a1b3c4d5e6f70-FRA';
const RAY_ID = '8f2a1b3c4d5e6f70';

function markers(over: Partial<DomMarkers> = {}): DomMarkers {
  return {
    title: '',
    host: 'claude.ai',
    hasChallengeRuntime: false,
    hasChallengeResponseInput: false,
    visibleChallengeWidget: false,
    bodyTextSample: '',
    ...over,
  };
}

function fakeResponse(
  status: number,
  headers: Record<string, string> = {},
  url = 'https://claude.ai/api/organizations',
): ObservableResponse {
  return { url: () => url, status: () => status, headers: () => headers };
}

/** Duck-typed stand-in for a Playwright page; see src/providers/interception.test.ts. */
function fakePage(opts: { url?: () => string; evaluate?: (source: string) => Promise<unknown> } = {}) {
  const handlers = new Set<(response: ObservableResponse) => void>();
  const seen: string[] = [];
  const page = {
    url: () => (opts.url ? opts.url() : 'https://claude.ai/login'),
    evaluate: async (source: string) => {
      seen.push(source);
      return opts.evaluate ? await opts.evaluate(source) : {};
    },
    on(_event: 'response', handler: (response: ObservableResponse) => void) { handlers.add(handler); },
    off(_event: 'response', handler: (response: ObservableResponse) => void) { handlers.delete(handler); },
  } as unknown as ObservablePage;
  return {
    page,
    handlers,
    evaluatedSources: seen,
    emit(response: ObservableResponse) { for (const handler of [...handlers]) handler(response); },
  };
}

describe('classifyResponse', () => {
  it('treats cf-mitigated: challenge as a challenge on a 200', () => {
    const v = classifyResponse(200, { 'cf-mitigated': 'challenge' });
    expect(v.verdict).toBe('challenge_detected');
    expect(v.kind).toBe('cloudflare_managed');
  });

  it('treats cf-mitigated: challenge as a challenge on a 403', () => {
    // The real Claude case: the interstitial arrives on the site's own XHR as a
    // 403, so the status alone would be misleading; the header is the signal.
    const v = classifyResponse(403, { 'cf-mitigated': 'challenge', 'cf-ray': CF_RAY, server: 'cloudflare' });
    expect(v.verdict).toBe('challenge_detected');
    expect(v.kind).toBe('cloudflare_managed');
    expect(v.rayId).toBe(RAY_ID);
  });

  it('prefers the challenge reading over a block reading on a cloudflare 403', () => {
    // A completable check must never be reported as a hard refusal: the person
    // can still finish it, and the copy for the two states differs completely.
    const v = classifyResponse(403, { 'cf-mitigated': 'challenge', server: 'cloudflare' });
    expect(v.verdict).toBe('challenge_detected');
    expect(v.kind).not.toBe('cloudflare_block');
  });

  it('reads a 403 document from a cloudflare server without cf-mitigated as a block', () => {
    const v = classifyResponse(403, { server: 'cloudflare' }, { isDocument: true });
    expect(v.verdict).toBe('blocked');
    expect(v.kind).toBe('cloudflare_block');
    expect(v.signal).toContain('403');
  });

  it('does NOT read a 403 sub-resource as a block', () => {
    // An image or API call can 403 on a perfectly healthy signed-in page.
    // Only a refusal of the page itself means the person is shut out.
    for (const status of [403, 503]) {
      const v = classifyResponse(status, { server: 'cloudflare', 'cf-ray': CF_RAY });
      expect(v.verdict, String(status)).toBe('ok');
      expect(v.rayId, String(status)).toBe(RAY_ID);
    }
  });

  it('reads a 503 document carrying only a cf-ray as a block', () => {
    const v = classifyResponse(503, { 'cf-ray': CF_RAY }, { isDocument: true });
    expect(v.verdict).toBe('blocked');
    expect(v.kind).toBe('cloudflare_block');
    expect(v.rayId).toBe(RAY_ID);
  });

  it('surfaces the ray id on an ok verdict too', () => {
    // The ray id is what the person quotes to the provider's support, so it has
    // to survive even when nothing was wrong with this particular response.
    const v = classifyResponse(200, { 'cf-ray': CF_RAY, server: 'cloudflare' });
    expect(v.verdict).toBe('ok');
    expect(v.rayId).toBe(RAY_ID);
  });

  it('returns ok for a plain 200 from an ordinary server', () => {
    const v = classifyResponse(200, { server: 'nginx', 'content-type': 'text/html' });
    expect(v.verdict).toBe('ok');
    expect(v.rayId).toBeUndefined();
    expect(v.kind).toBeUndefined();
  });

  it('returns ok for a 403 with no Cloudflare markers', () => {
    // An ordinary application 403 ("not your org") must not be dressed up as a
    // network-level block, which would send the person down the wrong path.
    expect(classifyResponse(403, { server: 'nginx' }).verdict).toBe('ok');
    expect(classifyResponse(403).verdict).toBe('ok');
  });

  it('looks headers up case-insensitively', () => {
    const v = classifyResponse(403, { 'CF-Mitigated': 'Challenge', 'CF-Ray': CF_RAY, Server: 'cloudflare' });
    expect(v.verdict).toBe('challenge_detected');
    expect(v.kind).toBe('cloudflare_managed');
    expect(v.rayId).toBe(RAY_ID);
  });

  it('ignores an empty cf-ray rather than reporting an empty support reference', () => {
    expect(classifyResponse(200, { 'cf-ray': '' }).rayId).toBeUndefined();
  });
});

describe('classifyDom', () => {
  it('reads the "Just a moment..." interstitial title as verifying', () => {
    const v = classifyDom(markers({ title: 'Just a moment...' }));
    expect(v.verdict).toBe('verifying');
    expect(v.kind).toBe('cloudflare_managed');
  });

  it('reads security-verification body copy as verifying', () => {
    const v = classifyDom(markers({ bodyTextSample: 'claude.ai needs to review the security of your connection before performing security verification.' }));
    expect(v.verdict).toBe('verifying');
  });

  it('reads the challenge runtime as verifying', () => {
    expect(classifyDom(markers({ hasChallengeRuntime: true })).verdict).toBe('verifying');
  });

  it('reads the hidden challenge response input as verifying', () => {
    expect(classifyDom(markers({ hasChallengeResponseInput: true })).verdict).toBe('verifying');
  });

  it('escalates a visible widget to challenge_detected', () => {
    // A spinner may clear on its own; a visible widget needs a human click, so
    // only this case is worth interrupting the person for.
    const v = classifyDom(markers({ title: 'Just a moment...', visibleChallengeWidget: true }));
    expect(v.verdict).toBe('challenge_detected');
    expect(v.kind).toBe('cloudflare_interactive');
  });

  it('reads the "Sorry, you have been blocked" page as blocked', () => {
    const v = classifyDom(markers({ bodyTextSample: 'Sorry, you have been blocked. You are unable to access claude.ai' }));
    expect(v.verdict).toBe('blocked');
    expect(v.kind).toBe('cloudflare_block');
  });

  it('reads a Cloudflare refusal code as blocked', () => {
    const v = classifyDom(markers({ bodyTextSample: 'Error code: 1020' }));
    expect(v.verdict).toBe('blocked');
    expect(v.kind).toBe('cloudflare_block');
    expect(v.signal).toContain('1020');
  });

  it('does not treat an unrelated four-digit code as a block', () => {
    // Only the documented refusal codes mean "do not retry"; any other number
    // on the page is just a number.
    expect(classifyDom(markers({ bodyTextSample: 'error code: 4040' })).verdict).toBe('ok');
  });

  it("reads Google's sign-in refusal as a Google block, not a Cloudflare one", () => {
    const v = classifyDom(markers({
      host: 'accounts.google.com',
      title: 'Sign in - Google Accounts',
      bodyTextSample: "Couldn't sign you in. This browser or app may not be secure.",
    }));
    expect(v.verdict).toBe('blocked');
    // The remedy for an untrusted-browser refusal is nothing like the remedy for
    // a Cloudflare block, so mislabelling the kind would misdirect the person.
    expect(v.kind).toBe('google_untrusted_browser');
  });

  it('matches the untrusted-browser wording on its own', () => {
    const v = classifyDom(markers({
      host: 'accounts.google.com',
      bodyTextSample: 'Try using a different browser. This browser or app may not be secure.',
    }));
    expect(v.kind).toBe('google_untrusted_browser');
  });

  it('only applies the Google refusal wording on a Google host', () => {
    // The same sentence quoted in a provider help article is not a refusal.
    const v = classifyDom(markers({ host: 'claude.ai', bodyTextSample: 'this browser or app may not be secure' }));
    expect(v.verdict).toBe('ok');
  });

  it('returns ok for an ordinary signed-in page', () => {
    const v = classifyDom(markers({ title: 'Claude', bodyTextSample: 'New chat Projects Recents Settings' }));
    expect(v).toEqual({ verdict: 'ok' });
  });

  it('lets a block signal win over an interstitial signal on the same page', () => {
    const v = classifyDom(markers({
      title: 'Attention Required! | Cloudflare',
      bodyTextSample: 'Sorry, you have been blocked',
      hasChallengeRuntime: true,
    }));
    expect(v.verdict).toBe('blocked');
  });

  it('lets a block signal win over a visible widget', () => {
    const v = classifyDom(markers({ bodyTextSample: 'Error code: 1015', visibleChallengeWidget: true }));
    expect(v.verdict).toBe('blocked');
    expect(v.kind).toBe('cloudflare_block');
  });
});

describe('classifyWindowTitle', () => {
  it('reads the interstitial title as verifying', () => {
    const v = classifyWindowTitle('Just a moment...');
    expect(v.verdict).toBe('verifying');
    expect(v.kind).toBe('cloudflare_managed');
  });

  it('reads a block title as blocked', () => {
    const v = classifyWindowTitle('Sorry, you have been blocked');
    expect(v.verdict).toBe('blocked');
    expect(v.kind).toBe('cloudflare_block');
  });

  it('reads a normal provider title as ok', () => {
    // The handoff browser is an ordinary window; its everyday title must not be
    // mistaken for a security check or the login would never complete.
    expect(classifyWindowTitle('Claude').verdict).toBe('ok');
    expect(classifyWindowTitle('Perplexity').verdict).toBe('ok');
  });

  it('reads an empty title as ok', () => {
    expect(classifyWindowTitle('')).toEqual({ verdict: 'ok' });
  });

  it('is case-insensitive about the window title', () => {
    expect(classifyWindowTitle('JUST A MOMENT...').verdict).toBe('verifying');
  });
});

describe('mergeVerdicts', () => {
  it('returns ok when called with nothing', () => {
    expect(mergeVerdicts()).toEqual({ verdict: 'ok' });
    expect(mergeVerdicts(undefined, undefined)).toEqual({ verdict: 'ok' });
  });

  it('orders ok < verifying < challenge_detected < blocked', () => {
    expect(mergeVerdicts({ verdict: 'ok' }, { verdict: 'verifying' }).verdict).toBe('verifying');
    expect(mergeVerdicts({ verdict: 'verifying' }, { verdict: 'challenge_detected' }).verdict).toBe('challenge_detected');
    expect(mergeVerdicts({ verdict: 'challenge_detected' }, { verdict: 'blocked' }).verdict).toBe('blocked');
    // The winner is the most severe observation, not the most recent one.
    expect(mergeVerdicts({ verdict: 'blocked' }, { verdict: 'verifying' }).verdict).toBe('blocked');
    expect(mergeVerdicts({ verdict: 'challenge_detected' }, { verdict: 'ok' }).verdict).toBe('challenge_detected');
  });

  it('keeps the kind of the most severe verdict', () => {
    const v = mergeVerdicts(
      { verdict: 'verifying', kind: 'cloudflare_managed' },
      { verdict: 'blocked', kind: 'cloudflare_block' },
    );
    expect(v.kind).toBe('cloudflare_block');
  });

  it('preserves a ray id from a lower-severity verdict when the winner has none', () => {
    const v = mergeVerdicts({ verdict: 'ok', rayId: RAY_ID }, { verdict: 'blocked', kind: 'cloudflare_block' });
    expect(v.verdict).toBe('blocked');
    expect(v.rayId).toBe(RAY_ID);
  });

  it('picks up a ray id that arrives after the severe verdict', () => {
    const v = mergeVerdicts({ verdict: 'blocked', kind: 'cloudflare_block' }, { verdict: 'ok', rayId: RAY_ID });
    expect(v.verdict).toBe('blocked');
    expect(v.rayId).toBe(RAY_ID);
  });

  it('does not let a later ok verdict overwrite an existing ray id', () => {
    const v = mergeVerdicts({ verdict: 'ok', rayId: RAY_ID }, { verdict: 'ok', rayId: 'other-ray' });
    expect(v.rayId).toBe(RAY_ID);
  });
});

describe('evaluateChallengeMarkers', () => {
  it('derives the host from the page url', async () => {
    const { page } = fakePage({ url: () => 'https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn' });
    const m = await evaluateChallengeMarkers(page);
    // Only the hostname is kept: the query string can carry sign-in state.
    expect(m.host).toBe('accounts.google.com');
  });

  it('never throws when evaluate rejects, and returns safe defaults', async () => {
    const { page } = fakePage({ evaluate: async () => { throw new Error('Execution context was destroyed'); } });
    await expect(evaluateChallengeMarkers(page)).resolves.toEqual({
      host: 'claude.ai',
      title: '',
      hasChallengeRuntime: false,
      hasChallengeResponseInput: false,
      visibleChallengeWidget: false,
      bodyTextSample: '',
    });
  });

  it('falls back to an empty host when the url cannot be parsed', async () => {
    const { page } = fakePage({ url: () => 'not a url' });
    expect((await evaluateChallengeMarkers(page)).host).toBe('');
  });

  it('survives a page whose url() itself throws', async () => {
    const { page } = fakePage({ url: () => { throw new Error('page closed'); } });
    expect((await evaluateChallengeMarkers(page)).host).toBe('');
  });

  it('evaluates the read-only marker source and fills gaps in a partial result', async () => {
    const { page, evaluatedSources } = fakePage({ evaluate: async () => ({ title: 'Just a moment...' }) });
    const m = await evaluateChallengeMarkers(page);
    expect(evaluatedSources).toEqual([CHALLENGE_MARKER_SOURCE]);
    expect(m.title).toBe('Just a moment...');
    expect(m.visibleChallengeWidget).toBe(false);
    // The probe and the classifier have to compose: this is the whole path.
    expect(classifyDom(m).verdict).toBe('verifying');
  });

  it('returns defaults when evaluate resolves null', async () => {
    const { page } = fakePage({ evaluate: async () => null });
    const m = await evaluateChallengeMarkers(page);
    expect(m.bodyTextSample).toBe('');
    expect(classifyDom(m).verdict).toBe('ok');
  });
});

describe('ChallengeWatcher', () => {
  it('registers a response handler on construction', () => {
    const { page, handlers } = fakePage();
    new ChallengeWatcher(page);
    expect(handlers.size).toBe(1);
  });

  it('starts clean', () => {
    const { page } = fakePage();
    const watcher = new ChallengeWatcher(page);
    expect(watcher.verdict).toEqual({ verdict: 'ok' });
    expect(watcher.hits).toBe(0);
    expect(watcher.firstHitAt).toBeNull();
  });

  it('counts only non-ok responses', () => {
    const { page, emit } = fakePage();
    const watcher = new ChallengeWatcher(page);
    emit(fakeResponse(200, { server: 'nginx' }));
    emit(fakeResponse(200, { 'cf-ray': CF_RAY }));
    expect(watcher.hits).toBe(0);
    // An ok response still contributes its support reference.
    expect(watcher.verdict.rayId).toBe(RAY_ID);
    emit(fakeResponse(403, { 'cf-mitigated': 'challenge', 'cf-ray': CF_RAY }));
    expect(watcher.hits).toBe(1);
    expect(watcher.verdict.verdict).toBe('challenge_detected');
  });

  it('escalates to the most severe verdict seen and records firstHitAt once', async () => {
    const { page, emit } = fakePage();
    const watcher = new ChallengeWatcher(page);
    const before = Date.now();
    emit(fakeResponse(403, { 'cf-mitigated': 'challenge', 'cf-ray': CF_RAY }));
    const firstHitAt = watcher.firstHitAt;
    expect(firstHitAt).toBeGreaterThanOrEqual(before);
    // Let the millisecond clock move on, so a re-stamped firstHitAt would show.
    await new Promise(resolve => setTimeout(resolve, 5));
    // The watcher sees sub-resources, so a bare 503 from the edge is NOT a
    // block here — only the mitigation header, which it already saw, counts.
    emit(fakeResponse(503, { 'cf-ray': CF_RAY, server: 'cloudflare' }));
    expect(watcher.verdict.verdict).toBe('challenge_detected');
    expect(watcher.hits).toBe(1);
    expect(watcher.firstHitAt).toBe(firstHitAt);
    // A later ok response must not walk the verdict back down.
    emit(fakeResponse(200, { server: 'nginx' }));
    expect(watcher.verdict.verdict).toBe('challenge_detected');
  });

  it('ignores a response whose status() or headers() throws', () => {
    const { page, emit } = fakePage();
    const watcher = new ChallengeWatcher(page);
    const broken: ObservableResponse = {
      url: () => 'https://claude.ai/api/organizations',
      status: () => { throw new Error('Response has been collected'); },
      headers: () => ({}),
    };
    expect(() => emit(broken)).not.toThrow();
    const brokenHeaders: ObservableResponse = {
      url: () => 'https://claude.ai/api/organizations',
      status: () => 403,
      headers: () => { throw new Error('Response has been collected'); },
    };
    expect(() => emit(brokenHeaders)).not.toThrow();
    expect(watcher.hits).toBe(0);
    // The watcher keeps working after a dead response.
    emit(fakeResponse(403, { 'cf-mitigated': 'challenge' }));
    expect(watcher.hits).toBe(1);
  });

  it('reset() forgets everything so a fresh navigation starts clean', () => {
    const { page, emit } = fakePage();
    const watcher = new ChallengeWatcher(page);
    emit(fakeResponse(503, { 'cf-ray': CF_RAY, server: 'cloudflare' }));
    watcher.reset();
    expect(watcher.verdict).toEqual({ verdict: 'ok' });
    expect(watcher.hits).toBe(0);
    expect(watcher.firstHitAt).toBeNull();
  });

  it('detach() removes the handler and stops observing', () => {
    const { page, handlers, emit } = fakePage();
    const watcher = new ChallengeWatcher(page);
    watcher.detach();
    expect(handlers.size).toBe(0);
    emit(fakeResponse(503, { 'cf-ray': CF_RAY, server: 'cloudflare' }));
    expect(watcher.hits).toBe(0);
    expect(watcher.verdict).toEqual({ verdict: 'ok' });
  });

  it('detach() tolerates a page that is already gone', () => {
    const handlers = new Set<(response: ObservableResponse) => void>();
    const page = {
      url: () => 'https://claude.ai/login',
      evaluate: async () => ({}),
      on(_event: 'response', handler: (response: ObservableResponse) => void) { handlers.add(handler); },
      off() { throw new Error('Target page, context or browser has been closed'); },
    } as unknown as ObservablePage;
    const watcher = new ChallengeWatcher(page);
    expect(() => watcher.detach()).not.toThrow();
  });
});

describe('CHALLENGE_MARKER_SOURCE', () => {
  // Conduit observes a security check; it must never touch one. These are the
  // guardrails on the only code this feature runs inside a provider's page.
  it('never assigns to a document or window property', () => {
    expect(CHALLENGE_MARKER_SOURCE).not.toMatch(/(?:document|window|doc)(?:\s*\.\s*[\w$]+)+\s*=(?!=)/);
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('innerHTML');
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('setAttribute');
  });

  it('never clicks, submits or dispatches anything', () => {
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('.click(');
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('.submit(');
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('dispatchEvent');
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('postMessage');
  });

  it('never navigates', () => {
    expect(CHALLENGE_MARKER_SOURCE).not.toMatch(/\blocation\b/);
    expect(CHALLENGE_MARKER_SOURCE).not.toMatch(/\bhistory\b/);
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('.reload(');
    expect(CHALLENGE_MARKER_SOURCE).not.toContain('window.open(');
  });

  it('reads the markers it claims to read', () => {
    // Guards the negative assertions above from passing on an empty string.
    expect(CHALLENGE_MARKER_SOURCE).toContain('querySelectorAll');
    expect(CHALLENGE_MARKER_SOURCE).toContain('innerText');
    expect(CHALLENGE_MARKER_SOURCE.trim().startsWith('(() =>')).toBe(true);
  });
});
