import { describe, expect, it } from 'vitest';
import {
  authenticatePlatformOperator,
  createPlatformOperatorCredential,
  hashPlatformToken,
  platformCapabilityAllowed,
  requirePlatformCapability,
} from '../src/platform-auth.js';
import type { BridgeConfig } from '../src/types.js';

function cfg(token: string): BridgeConfig {
  return {
    port: 31338,
    host: '127.0.0.1',
    logLevel: 'silent',
    apiKeys: {},
    platformAuth: {
      operators: [{
        id: 'alice-reviewer',
        displayName: 'Alice',
        role: 'reviewer',
        tokenHash: hashPlatformToken(token, Buffer.alloc(16, 7)),
        workspaceIds: ['workspace-a'],
      }],
    },
  };
}

describe('platform operator authentication', () => {
  it('stores a salted hash and authenticates without retaining the raw token', () => {
    const token = 'operator-token-with-at-least-32-bytes-123';
    const config = cfg(token);
    expect(JSON.stringify(config)).not.toContain(token);
    const context = authenticatePlatformOperator(`Bearer ${token}`, config);
    expect(context).toMatchObject({
      operatorId: 'alice-reviewer',
      role: 'reviewer',
      workspaceIds: ['workspace-a'],
      source: 'operator-token',
    });
    expect(authenticatePlatformOperator('Bearer wrong-token-that-is-long-enough-123', config)).toBeNull();
    expect(authenticatePlatformOperator(`Bearer ${token},Bearer other`, config)).toBeNull();
  });

  it('maps the existing bridge token and auth-disabled loopback to local admin', () => {
    expect(authenticatePlatformOperator('Bearer existing-bridge-token', {
      authToken: 'existing-bridge-token',
    })).toMatchObject({ operatorId: 'local-admin', role: 'admin', source: 'bridge-token' });
    expect(authenticatePlatformOperator(undefined, {}, { isLoopback: true }))
      .toMatchObject({ operatorId: 'local-admin', role: 'admin', source: 'loopback-no-auth' });
    expect(authenticatePlatformOperator(undefined, {}, { isLoopback: false })).toBeNull();
  });

  it('keeps auth-disabled loopback compatibility when remote operators are configured', () => {
    const token = 'operator-token-with-at-least-32-bytes-123';
    expect(authenticatePlatformOperator(undefined, cfg(token), { isLoopback: true }))
      .toMatchObject({ operatorId: 'local-admin', role: 'admin' });
  });

  it('enforces role capabilities and workspace allowlists independently', () => {
    const token = 'operator-token-with-at-least-32-bytes-123';
    const reviewer = authenticatePlatformOperator(`Bearer ${token}`, cfg(token))!;
    expect(platformCapabilityAllowed(reviewer, 'view', 'workspace-a')).toBe(true);
    expect(platformCapabilityAllowed(reviewer, 'review', 'workspace-a')).toBe(true);
    expect(platformCapabilityAllowed(reviewer, 'operate', 'workspace-a')).toBe(false);
    expect(platformCapabilityAllowed(reviewer, 'review', 'workspace-b')).toBe(false);
    expect(() => requirePlatformCapability(reviewer, 'review', 'workspace-b')).toThrow(/cannot review/i);
  });

  it('generates a high-entropy token separately from its verifier', () => {
    const credential = createPlatformOperatorCredential();
    expect(credential.token).not.toBe(credential.tokenHash);
    expect(credential.tokenHash).toMatch(/^sha256:/);
    expect(authenticatePlatformOperator(`Bearer ${credential.token}`, {
      platformAuth: { operators: [{ id: 'generated', role: 'viewer', tokenHash: credential.tokenHash, workspaceIds: ['*'] }] },
    })?.operatorId).toBe('generated');
  });

  it('fails closed for duplicate audit identities or token verifiers', () => {
    const token = 'operator-token-with-at-least-32-bytes-123';
    const config = cfg(token);
    config.platformAuth!.operators!.push({
      ...config.platformAuth!.operators![0],
      role: 'admin',
    });
    expect(authenticatePlatformOperator(`Bearer ${token}`, config)).toBeNull();
  });
});
