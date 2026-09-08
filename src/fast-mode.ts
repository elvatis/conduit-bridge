/** Provider/model support verified in the vendors' Fast mode docs, 2026-09-08.
 * Availability and billing still depend on the account. Never switch models.
 * https://developers.openai.com/api/docs/guides/fast-mode
 * https://learn.chatgpt.com/docs/config-file/config-reference
 * https://code.claude.com/docs/en/fast-mode
 * https://platform.claude.com/docs/en/build-with-claude/fast-mode
 */
export function supportsFastMode(provider: string, model: string): boolean {
  const id = model.split('/').at(-1) || '';
  if (provider === 'cli-claude' || provider === 'claude-api') return /^claude-opus-(?:5|4[.-]8)(?:-|$)/.test(id);
  if (provider === 'cli-codex' || provider === 'codex-api') return /^gpt-(?:5\.[456]|6)(?:[.-]|$)/.test(id) && !/(?:-pro|-mini|-nano)(?:-|$)/.test(id);
  return false;
}

export class FastModeError extends Error {
  readonly status = 400;
  constructor(message: string) { super(message); this.name = 'FastModeError'; }
}

export function parseFastMode(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new FastModeError('fastMode must be a boolean');
  return value;
}

export function requireFastModeSupport(provider: string, model: string, enabled?: boolean): void {
  if (enabled && !supportsFastMode(provider, model)) throw new FastModeError('Faster speed is not supported for this provider/model');
}
