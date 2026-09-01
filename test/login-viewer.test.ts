import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import {
  loginViewerUrl,
  serveLoginViewer,
  validateLoginViewerInput,
} from '../src/login/viewer.js';

describe('built-in browser viewer', () => {
  it('uses a provider-scoped route on the bridge origin', () => {
    expect(loginViewerUrl('perplexity')).toBe('/v1/login/perplexity/viewer');
  });

  it('serves a self-contained page that polls frames and sends inputs', async () => {
    const server = createServer((req, res) => serveLoginViewer(req, res, 'perplexity'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(html).toContain("base + '/frame");
      expect(html).toContain("base + '/input'");
      expect(html).not.toMatch(/VNC|websockify|RFB/i);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('validates and bounds pointer input', () => {
    expect(validateLoginViewerInput({ type: 'pointer', action: 'down', x: -2, y: 90_000, button: 'left' }))
      .toEqual({ type: 'pointer', action: 'down', x: 0, y: 10_000, button: 'left' });
    expect(validateLoginViewerInput({ type: 'pointer', action: 'click', x: 1, y: 2 })).toBeNull();
  });

  it('validates keyboard, wheel and text input', () => {
    expect(validateLoginViewerInput({ type: 'key', action: 'down', key: 'Enter' }))
      .toEqual({ type: 'key', action: 'down', key: 'Enter' });
    expect(validateLoginViewerInput({ type: 'wheel', deltaX: 0, deltaY: 99 }))
      .toEqual({ type: 'wheel', deltaX: 0, deltaY: 99 });
    expect(validateLoginViewerInput({ type: 'text', text: 'hello' }))
      .toEqual({ type: 'text', text: 'hello' });
    expect(validateLoginViewerInput({ type: 'text', text: 'x'.repeat(20_000) })).toBeNull();
  });
});
