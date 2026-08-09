import { describe, it, expect } from 'vitest';
import {
  pickEffort,
  parseEffort,
  toOpenAiEffort,
  toClaudeEffort,
  toAgyEffort,
} from '../src/effort.js';

describe('effort helpers', () => {
  it('pickEffort prefers effort over reasoning_effort', () => {
    expect(pickEffort({ effort: 'high', reasoning_effort: 'low' })).toBe('high');
    expect(pickEffort({ reasoning_effort: 'minimal' })).toBe('minimal');
    expect(pickEffort({})).toBeUndefined();
  });

  it('parseEffort normalizes case and empties', () => {
    expect(parseEffort('HIGH')).toBe('high');
    expect(parseEffort('')).toBeUndefined();
    expect(parseEffort(null)).toBeUndefined();
  });

  it('maps OpenAI ladder including aliases', () => {
    expect(toOpenAiEffort('xhigh')).toBe('xhigh');
    expect(toOpenAiEffort('min')).toBe('minimal');
    expect(toOpenAiEffort('weird')).toBe('medium');
    expect(toOpenAiEffort(undefined)).toBeUndefined();
  });

  it('maps Claude ladder (none/minimal -> low)', () => {
    expect(toClaudeEffort('none')).toBe('low');
    expect(toClaudeEffort('minimal')).toBe('low');
    expect(toClaudeEffort('max')).toBe('max');
    expect(toClaudeEffort('high')).toBe('high');
  });

  it('maps agy ladder to low|medium|high', () => {
    expect(toAgyEffort('none')).toBe('low');
    expect(toAgyEffort('medium')).toBe('medium');
    expect(toAgyEffort('xhigh')).toBe('high');
    expect(toAgyEffort('max')).toBe('high');
  });
});
