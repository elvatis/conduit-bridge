/** Strip credential-shaped tokens from operational text. Never log the raw value. */
export function redactSecrets(message: string): string {
  return String(message ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, 240)
    .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{10,255}\b/g, '[redacted]')
    .replace(/(Bearer\s+|(?:sk|pplx|xai)-)[A-Za-z0-9._-]+/gi, '$1[redacted]');
}
