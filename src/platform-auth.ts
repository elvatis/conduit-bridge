import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  BridgeConfig,
  PlatformOperatorConfig,
  PlatformRole,
} from './types.js';

const TOKEN_PREFIX = 'sha256';
const TOKEN_MIN_BYTES = 32;
const TOKEN_MAX_BYTES = 4096;
const OPERATOR_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/;
const WORKSPACE_ID = /^(?:\*|[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,299})$/;

export type PlatformCapability = 'view' | 'operate' | 'review' | 'admin';

export interface PlatformOperatorContext {
  operatorId: string;
  displayName: string;
  role: PlatformRole;
  workspaceIds: string[];
  source: 'bridge-token' | 'operator-token' | 'loopback-no-auth';
}

export interface PlatformAuthenticationOptions {
  /** True only after the server has established that the peer is loopback. */
  isLoopback?: boolean;
}

export class PlatformAuthorizationError extends Error {
  readonly status = 403;
  readonly code = 'forbidden';

  constructor(message = 'This operator is not allowed to perform that action.') {
    super(message);
    this.name = 'PlatformAuthorizationError';
  }
}

function tokenBytes(token: string): Buffer {
  const bytes = Buffer.from(token, 'utf8');
  if (bytes.length < TOKEN_MIN_BYTES || bytes.length > TOKEN_MAX_BYTES || /[\0\r\n]/.test(token)) {
    throw new Error(`platform bearer token must be ${TOKEN_MIN_BYTES}-${TOKEN_MAX_BYTES} bytes without control characters`);
  }
  return bytes;
}

function digest(salt: Buffer, token: string): Buffer {
  return createHash('sha256')
    .update('conduit-platform-operator-v1\0', 'utf8')
    .update(salt)
    .update(tokenBytes(token))
    .digest();
}

/** Create a salted verifier suitable for config.json. The raw token is not retained. */
export function hashPlatformToken(token: string, salt = randomBytes(16)): string {
  if (salt.length !== 16) throw new Error('platform token salt must be exactly 16 bytes');
  return `${TOKEN_PREFIX}:${salt.toString('base64url')}:${digest(salt, token).toString('base64url')}`;
}

/** Generate a high-entropy bearer and its independently salted stored verifier. */
export function createPlatformOperatorCredential(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPlatformToken(token) };
}

function parseTokenHash(value: string): { salt: Buffer; expected: Buffer } | undefined {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return undefined;
  try {
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    return salt.length === 16 && expected.length === 32 ? { salt, expected } : undefined;
  } catch {
    return undefined;
  }
}

function matchesHash(token: string, encoded: string): boolean {
  const parsed = parseTokenHash(encoded);
  if (!parsed) return false;
  try {
    const actual = digest(parsed.salt, token);
    return timingSafeEqual(parsed.expected, actual);
  } catch {
    return false;
  }
}

function matchesRawToken(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  // Hash both sides to keep timingSafeEqual lengths fixed without storing a
  // second long-lived copy of the bridge token.
  const left = createHash('sha256').update(actual, 'utf8').digest();
  const right = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(left, right);
}

function bearer(authorization: string | string[] | undefined): string | undefined {
  if (typeof authorization !== 'string') return undefined;
  const match = /^Bearer ([^\s,]+)$/i.exec(authorization.trim());
  return match?.[1];
}

function validOperator(operator: PlatformOperatorConfig): boolean {
  return !!operator
    && OPERATOR_ID.test(operator.id)
    && ['viewer', 'operator', 'reviewer', 'admin'].includes(operator.role)
    && typeof operator.tokenHash === 'string'
    && parseTokenHash(operator.tokenHash) !== undefined
    && (operator.workspaceIds === undefined
      || (Array.isArray(operator.workspaceIds)
        && operator.workspaceIds.length <= 100
        && operator.workspaceIds.every(id => typeof id === 'string' && WORKSPACE_ID.test(id))));
}

function contextFor(operator: PlatformOperatorConfig): PlatformOperatorContext {
  return {
    operatorId: operator.id,
    displayName: typeof operator.displayName === 'string' && operator.displayName.trim()
      ? operator.displayName.trim().slice(0, 200)
      : operator.id,
    role: operator.role,
    workspaceIds: [...new Set(operator.workspaceIds ?? [])],
    source: 'operator-token',
  };
}

function localAdmin(source: 'bridge-token' | 'loopback-no-auth'): PlatformOperatorContext {
  return {
    operatorId: 'local-admin',
    displayName: 'Local administrator',
    role: 'admin',
    workspaceIds: ['*'],
    source,
  };
}

/**
 * Authenticate a platform request from its Authorization header. Configured
 * operator tokens are compared only with salted hashes. Existing bridge-token
 * and loopback-with-auth-disabled behavior maps to a stable local admin identity.
 */
export function authenticatePlatformOperator(
  authorization: string | string[] | undefined,
  cfg: Pick<BridgeConfig, 'authToken' | 'platformAuth'>,
  options: PlatformAuthenticationOptions = {},
): PlatformOperatorContext | null {
  const token = bearer(authorization);
  const bridgeToken = typeof cfg.authToken === 'string' ? cfg.authToken.trim() : '';
  if (token && bridgeToken && matchesRawToken(token, bridgeToken)) return localAdmin('bridge-token');

  let matched: PlatformOperatorContext | null = null;
  if (token) {
    const operators = (cfg.platformAuth?.operators ?? [])
      .filter(operator => validOperator(operator) && operator.enabled !== false);
    const idCounts = new Map<string, number>();
    const hashCounts = new Map<string, number>();
    for (const operator of operators) {
      idCounts.set(operator.id, (idCounts.get(operator.id) ?? 0) + 1);
      hashCounts.set(operator.tokenHash, (hashCounts.get(operator.tokenHash) ?? 0) + 1);
    }
    // Do not stop at the first hash; comparable work is performed for each
    // configured operator and duplicate verifiers cannot change authorization.
    for (const operator of operators) {
      if (idCounts.get(operator.id) !== 1 || hashCounts.get(operator.tokenHash) !== 1) continue;
      if (matchesHash(token, operator.tokenHash) && !matched) matched = contextFor(operator);
    }
  }
  if (matched) return matched;

  if (!bridgeToken && options.isLoopback === true) return localAdmin('loopback-no-auth');
  return null;
}

const ROLE_CAPABILITIES: Record<PlatformRole, ReadonlySet<PlatformCapability>> = {
  viewer: new Set(['view']),
  operator: new Set(['view', 'operate']),
  reviewer: new Set(['view', 'review']),
  admin: new Set(['view', 'operate', 'review', 'admin']),
};

export function platformCapabilityAllowed(
  context: PlatformOperatorContext,
  capability: PlatformCapability,
  workspaceId?: string,
): boolean {
  if (!ROLE_CAPABILITIES[context.role]?.has(capability)) return false;
  if (workspaceId === undefined) return true;
  if (!WORKSPACE_ID.test(workspaceId)) return false;
  return context.workspaceIds.includes('*') || context.workspaceIds.includes(workspaceId);
}

export function requirePlatformCapability(
  context: PlatformOperatorContext | null,
  capability: PlatformCapability,
  workspaceId?: string,
): asserts context is PlatformOperatorContext {
  if (!context) throw new PlatformAuthorizationError('A valid platform operator bearer token is required.');
  if (!platformCapabilityAllowed(context, capability, workspaceId)) {
    throw new PlatformAuthorizationError(
      workspaceId
        ? `Operator ${context.operatorId} cannot ${capability} workspace ${workspaceId}.`
        : `Operator ${context.operatorId} does not have the ${capability} capability.`,
    );
  }
}
