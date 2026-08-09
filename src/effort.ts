/**
 * Normalize cross-provider reasoning/effort levels.
 *
 * Clients may send either `effort` or OpenAI's `reasoning_effort`.
 * Providers map the normalized level to their own wire format.
 */

export type OpenAiEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AgyEffort = 'low' | 'medium' | 'high';

const OPENAI_LEVELS = new Set<string>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const CLAUDE_LEVELS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);

/** Coerce raw request values to a lowercase string level, or undefined. */
export function parseEffort(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const s = String(raw).trim().toLowerCase();
  return s || undefined;
}

/** Prefer explicit effort, then OpenAI-style reasoning_effort. */
export function pickEffort(body: { effort?: unknown; reasoning_effort?: unknown }): string | undefined {
  return parseEffort(body.effort) ?? parseEffort(body.reasoning_effort);
}

/** Map to OpenAI chat completions `reasoning_effort`. Unknown -> medium. */
export function toOpenAiEffort(level: string | undefined): OpenAiEffort | undefined {
  if (!level) return undefined;
  if (OPENAI_LEVELS.has(level)) return level as OpenAiEffort;
  // Common aliases
  if (level === 'maxx' || level === 'maximum') return 'max';
  if (level === 'min') return 'minimal';
  return 'medium';
}

/** Map to Anthropic `output_config.effort`. none/minimal collapse to low. */
export function toClaudeEffort(level: string | undefined): ClaudeEffort | undefined {
  if (!level) return undefined;
  if (level === 'none' || level === 'minimal' || level === 'min') return 'low';
  if (CLAUDE_LEVELS.has(level)) return level as ClaudeEffort;
  return 'high';
}

/** Map to agy `--effort` (only low|medium|high). */
export function toAgyEffort(level: string | undefined): AgyEffort | undefined {
  if (!level) return undefined;
  if (level === 'none' || level === 'minimal' || level === 'low' || level === 'min') return 'low';
  if (level === 'medium' || level === 'med') return 'medium';
  // high, xhigh, max
  return 'high';
}

/** Map to Grok CLI `--reasoning-effort` / `--effort` (reuse OpenAI ladder). */
export function toGrokEffort(level: string | undefined): OpenAiEffort | undefined {
  return toOpenAiEffort(level);
}
