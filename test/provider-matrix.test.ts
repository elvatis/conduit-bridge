import { describe, it, expect } from 'vitest';
// @ts-expect-error The standalone community script intentionally ships as dependency-free ESM.
import { matrixOptions } from '../scripts/provider-matrix.mjs';
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
});
