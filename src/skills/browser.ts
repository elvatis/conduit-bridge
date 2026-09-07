import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { SkillError, type SkillDefinition } from './index.js';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001:db8::', 32], ['2001::', 32], ['2001:20::', 28], ['2002::', 16]] as const) blocked.addSubnet(address, prefix, 'ipv6');

/** Only public unicast destinations are eligible for unauthenticated page fetching. */
export function isPublicWebAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

/** Validate URL syntax independently of the DNS address check at every redirect. */
export function publicPageUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 4096) throw new SkillError('Page URL must be at most 4096 characters');
  let url: URL;
  try { url = new URL(value); } catch { throw new SkillError('Invalid page URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || /[\r\n\0]/.test(value)) throw new SkillError('Use an HTTP(S) URL on its standard port without credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicWebAddress(host)) throw new SkillError('Private or reserved network destinations are not allowed', 403);
  return url;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new SkillError('Page fetch cancelled or timed out', 504));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function page(url: URL, signal: AbortSignal): Promise<{ status: number; location?: string; contentType: string; body: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await abortable(lookup(host, { all: true }), signal);
  if (!addresses.length || addresses.some(item => !isPublicWebAddress(item.address))) throw new SkillError('Private or reserved network destinations are not allowed', 403);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    // Pin the checked address in this socket lookup; a later DNS answer cannot rebind it.
    const pinned = addresses[0];
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', agent: false, family: pinned.family, signal,
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
      headers: { 'User-Agent': 'conduit-bridge-page-fetch', Accept: 'text/html,text/plain,application/json;q=0.5', 'Accept-Encoding': 'identity' },
    }, response => {
      const status = response.statusCode ?? 502;
      const location = response.headers.location;
      if (status >= 300 && status < 400) { response.destroy(); resolve({ status, location, contentType: '', body: '' }); return; }
      const contentType = response.headers['content-type'] ?? '';
      if (status < 200 || status >= 300) { response.destroy(); reject(new SkillError(`Page returned HTTP ${status}`, 502)); return; }
      if (!/^(?:text\/(?:html|plain)|application\/(?:json|xhtml\+xml))(?:;|$)/i.test(contentType) || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) { response.destroy(); reject(new SkillError('Page must return uncompressed HTML, text or JSON')); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 512 * 1024) { response.destroy(); reject(new SkillError('Page exceeds the 512 KiB fetch limit', 413)); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', () => reject(new SkillError('Page response was interrupted', 502)));
    });
    request.on('error', () => reject(new SkillError(signal.aborted ? 'Page fetch cancelled or timed out' : 'Page fetch failed', signal.aborted ? 504 : 502)));
    request.end();
  });
}

function plainText(html: string): string {
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity] ?? entity).replace(/\s+/g, ' ').trim();
}

/** Fetch public page text without JavaScript execution, login cookies or a browser dependency. */
export const browserSkill: SkillDefinition = {
  name: 'browser', description: 'Fetch public page text with redirect and network checks. Does not execute JavaScript or use login cookies.', effect: 'network',
  schema: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string', maxLength: 4096 }, maxTextChars: { type: 'integer', minimum: 1, maximum: 50000 } } },
  async execute(input, context) {
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(15000)]);
    let url = publicPageUrl(input.url);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const result = await page(url, signal);
      if (result.status >= 300 && result.status < 400) {
        if (!result.location || redirects === 3) throw new SkillError('Page redirect limit exceeded');
        url = publicPageUrl(new URL(result.location, url).href);
        continue;
      }
      const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(result.body)?.[1];
      const text = /html/i.test(result.contentType) ? plainText(result.body) : result.body;
      const max = typeof input.maxTextChars === 'number' ? input.maxTextChars : 20000;
      return { url: url.href, status: result.status, title: title ? plainText(title).slice(0, 300) : undefined, text: text.slice(0, max), truncated: text.length > max, javascriptExecuted: false, untrustedContent: true };
    }
    throw new SkillError('Page redirect limit exceeded');
  },
};
