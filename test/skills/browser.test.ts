import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const net = vi.hoisted(() => ({ addresses: [{ address: '93.184.216.34', family: 4 }], responses: [] as Array<{ status: number; headers: Record<string, string>; body?: string }>, options: [] as any[] }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => net.addresses) }));
vi.mock('node:https', () => ({ request: (_url: URL, options: any, callback: (response: any) => void) => {
  net.options.push(options); const request = new EventEmitter() as any;
  request.end = () => { queueMicrotask(() => { const reply = net.responses.shift()!; const response = new EventEmitter() as any; response.statusCode = reply.status; response.headers = reply.headers; response.destroy = () => {}; callback(response); response.emit('data', Buffer.from(reply.body || '')); response.emit('end'); }); };
  return request;
} }));
import { browserSkill, isPublicWebAddress, publicPageUrl } from '../../src/skills/browser.js';
import type { SkillExecutionContext } from '../../src/skills/index.js';
const context = { signal: new AbortController().signal } as SkillExecutionContext;
beforeEach(() => { net.addresses = [{ address: '93.184.216.34', family: 4 }]; net.responses = []; net.options = []; });
describe('public page tool', () => {
  it('rejects private/reserved/mapped destinations and credentials', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) expect(isPublicWebAddress(ip)).toBe(false);
    expect(isPublicWebAddress('8.8.8.8')).toBe(true); expect(isPublicWebAddress('2606:4700:4700::1111')).toBe(true);
    for (const url of ['file:///etc/passwd', 'http://127.0.0.1/', 'https://user:pass@example.com/', 'https://example.com:8080/']) expect(() => publicPageUrl(url)).toThrow();
  });
  it('pins the validated DNS address and extracts plain text without scripts', async () => {
    net.responses.push({ status: 200, headers: { 'content-type': 'text/html' }, body: '<title>Example</title><script>untrustedCode()</script><p>Hello &amp; welcome</p>' });
    const result = await browserSkill.execute({ url: 'https://example.com/' }, context);
    expect(result).toMatchObject({ title: 'Example', text: 'Example Hello & welcome', javascriptExecuted: false, untrustedContent: true });
    const callback = vi.fn(); net.options[0].lookup('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(net.options[0].headers.Cookie).toBeUndefined();
  });
  it('blocks private DNS answers and redirect escapes before another request', async () => {
    net.addresses = [{ address: '127.0.0.1', family: 4 }];
    await expect(browserSkill.execute({ url: 'https://example.com/' }, context)).rejects.toThrow('Private'); expect(net.options).toHaveLength(0);
    net.addresses = [{ address: '93.184.216.34', family: 4 }]; net.responses.push({ status: 302, headers: { location: 'http://169.254.169.254/latest/' } });
    await expect(browserSkill.execute({ url: 'https://example.com/' }, context)).rejects.toThrow('Private'); expect(net.options).toHaveLength(1);
  });
});
