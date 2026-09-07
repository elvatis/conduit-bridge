/**
 * Read the optional bridge token for scripts that are deliberately restricted
 * to a loopback origin. This module has no network access; callers validate the
 * destination before attaching these headers to a request.
 */
export function loopbackAuthorization() {
  const token = typeof process.env.CONDUIT_AUTH_TOKEN === 'string'
    ? process.env.CONDUIT_AUTH_TOKEN.trim()
    : '';
  if (!token) return {};
  if (token.length > 4096 || /[\r\n]/.test(token)) throw new Error('CONDUIT_AUTH_TOKEN is invalid');
  return { Authorization: `Bearer ${token}` };
}
