/** Strip credential-shaped tokens from operational text. Never log the raw value. */
export function redactSecrets(message: string): string {
  return String(message ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, 240)
    .replace(/(Bearer\s+|(?:sk|pplx|xai)-)[A-Za-z0-9._-]+/gi, '$1[redacted]');
}
