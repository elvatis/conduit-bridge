import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeDir } from './config.js';
import { RuntimeJsonFile } from './runtime-json.js';
import { SkillError } from './skills/index.js';

/** Rolling request ceilings and an explicitly estimated cost per admitted call. Zero disables a ceiling. */
export interface AgentRateLimits { perMinute: number; perHour: number; perDay: number; costPerCall?: number }
/** One admission, persisted before any provider request starts. */
export interface AgentCall { id: string; agent: string; at: number; cost: number }
interface RateState { calls: AgentCall[]; totals: Record<string, number> }
const DEFAULT: AgentRateLimits = { perMinute: 10, perHour: 100, perDay: 500, costPerCall: 0 };

/** Cross-process admission limits for orchestrated cloud calls; normal budget accounting remains authoritative. */
export class RateLimiter {
  private readonly file: RuntimeJsonFile<RateState>;
  constructor(directory = runtimeDir(), private readonly limits: Partial<Record<string, AgentRateLimits>> = {}, private readonly now = Date.now) {
    this.file = new RuntimeJsonFile(join(directory, 'rate-limits.json'), () => ({ calls: [], totals: {} }));
  }
  private settings(agent: string): AgentRateLimits {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(agent) || ['constructor', 'prototype'].includes(agent)) throw new SkillError('Invalid rate-limit agent');
    const limits = Object.hasOwn(this.limits, agent) ? this.limits[agent] ?? DEFAULT : DEFAULT;
    for (const value of [limits.perMinute, limits.perHour, limits.perDay]) if (!Number.isSafeInteger(value) || value < 0) throw new SkillError('Rate limits must be nonnegative integers');
    if (!Number.isFinite(limits.costPerCall ?? 0) || (limits.costPerCall ?? 0) < 0) throw new SkillError('Invalid estimated call cost');
    return limits;
  }
  /** Atomically reserve one call; failed requests still consume quota because they may incur upstream cost. */
  reserve(agent: string): AgentCall {
    const limits = this.settings(agent);
    return this.file.update(state => {
      const now = this.now();
      state.calls = state.calls.filter(call => now - call.at < 86400000);
      const calls = state.calls.filter(call => call.agent === agent);
      for (const [window, limit] of [[60000, limits.perMinute], [3600000, limits.perHour], [86400000, limits.perDay]]) {
        if (limit > 0 && calls.filter(call => now - call.at < window).length >= limit) throw new SkillError('Agent request quota reached', 429);
      }
      if (state.calls.length >= 50000) throw new SkillError('Rate-limit record capacity reached', 429);
      const call = { id: randomUUID(), agent, at: now, cost: limits.costPerCall ?? 0 };
      state.calls.push(call);
      state.totals[agent] = (Object.hasOwn(state.totals, agent) ? state.totals[agent] : 0) + call.cost;
      return call;
    });
  }
  /** Replace an admission's configured estimate with measured or host-estimated usage cost. */
  recordCost(id: string, cost: number): void {
    if (!Number.isFinite(cost) || cost < 0) throw new SkillError('Invalid call cost');
    this.file.update(state => {
      const call = state.calls.find(item => item.id === id);
      if (!call) throw new SkillError('Call record no longer retained', 404);
      state.totals[call.agent] += cost - call.cost; call.cost = cost;
    });
  }
  /** Rolling counts and lifetime configured/recorded costs, never a provider billing claim. */
  summary(): { calls: AgentCall[]; totals: Record<string, number> } {
    const state = this.file.read();
    return { calls: state.calls.filter(call => this.now() - call.at < 86400000), totals: state.totals };
  }
}
