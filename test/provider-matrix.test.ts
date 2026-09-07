import { describe, it, expect } from 'vitest';
// @ts-expect-error The standalone community script intentionally ships as dependency-free ESM.
import { matrixOptions } from '../scripts/provider-matrix.mjs';
import { loopbackAuthorization } from '../scripts/loopback-auth.mjs';
const models = 'cli-claude/a,cli-codex/b,cli-gemini/c,cli-grok/d';
describe('live provider matrix authorization', () => {
  it('requires all four transports and explicit file-write authorization', () => {
    expect(() => matrixOptions(['--models', models])).toThrow('allow-agent-writes');
    expect(() => matrixOptions(['--models', 'cli-claude/a,cli-claude/b,cli-gemini/c,cli-grok/d', '--allow-agent-writes'])).toThrow('exactly one');
    expect(matrixOptions(['--models', models, '--allow-agent-writes']).models).toHaveLength(4);
  });
  it('refuses remote or credential-bearing targets', () => {
    for (const url of ['https://example.com', 'http://user:password@localhost', 'http://localhost/a']) expect(() => matrixOptions(['--models', models, '--allow-agent-writes', '--base-url', url])).toThrow('loopback');
  });

  it('rejects malformed loopback credentials before a request is built', () => {
    const previous = process.env.CONDUIT_AUTH_TOKEN;
    try {
      process.env.CONDUIT_AUTH_TOKEN = 'token\nwith-control';
      expect(() => loopbackAuthorization()).toThrow(/invalid/i);
    } finally {
      if (previous === undefined) delete process.env.CONDUIT_AUTH_TOKEN;
      else process.env.CONDUIT_AUTH_TOKEN = previous;
    }
  });
});
