import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runtimeDir } from './config.js';
import type { BudgetConfig, BudgetUsage } from './types.js';

export const DEFAULT_BUDGET: BudgetConfig = {
  maxCostPerRunUsd: 0.50,
  maxTokensPerRun: 50000,
  maxDurationMs: 120000,
  dailyBudgetUsd: 10.00,
  monthlyBudgetUsd: 100.00,
  warningThresholdPercent: 80,
  hardStop: true,
  providerLimits: {},
  modelLimits: {},
};

export class BudgetExceededError extends Error {
  readonly status = 402;
  readonly code = 'budget_exceeded';
}

interface RunSpend { costUsd: number; tokens: number; startedAt: number; finished?: boolean; maxCostUsd?: number; }
interface Reservation { runId: string; model: string; provider: string; estimatedCostUsd: number; estimatedTokens: number; }

function amount(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number`);
  return value;
}

function identifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^[\w./:@-]{1,300}$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error(`${name} must be a safe nonempty identifier`);
}

function entries(value: unknown, name: string): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return Object.entries(value);
}

function validateReservation(value: unknown): asserts value is Reservation {
  if (!value || typeof value !== 'object') throw new Error('Invalid budget reservation');
  const item = value as Reservation;
  identifier(item.runId, 'reservation runId');
  identifier(item.model, 'reservation model');
  identifier(item.provider, 'reservation provider');
  amount(item.estimatedCostUsd, 'reservation cost');
  amount(item.estimatedTokens, 'reservation tokens');
}

function validateConfig(config: BudgetConfig): void {
  for (const key of ['maxCostPerRunUsd', 'maxTokensPerRun', 'maxDurationMs', 'dailyBudgetUsd', 'monthlyBudgetUsd', 'warningThresholdPercent'] as const) amount(config[key], key);
  if (config.warningThresholdPercent > 100) throw new Error('warningThresholdPercent must be at most 100');
  if (typeof config.hardStop !== 'boolean') throw new Error('hardStop must be a boolean');
  for (const key of ['providerLimits', 'modelLimits'] as const) {
    if (config[key] !== undefined && (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key]))) throw new Error(`${key} must be an object`);
    for (const value of Object.values(config[key] || {})) amount(value, key);
    for (const id of Object.keys(config[key] || {})) identifier(id, key);
  }
}

export class BudgetManager {
  private config: BudgetConfig;
  private usage: BudgetUsage;
  private readonly usageFile: string;
  private runs = new Map<string, RunSpend>();
  private reservations = new Map<string, Reservation>();

  constructor(
    initialConfig?: Partial<BudgetConfig>,
    usageFile = join(runtimeDir(), 'budget-usage.json'),
  ) {
    this.config = structuredClone({ ...DEFAULT_BUDGET, ...(initialConfig || {}) });
    validateConfig(this.config);
    this.usageFile = usageFile;
    this.usage = this.loadUsage();
    this.checkRollover();
    this.saveUsage();
  }

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private loadUsage(): BudgetUsage {
    if (existsSync(this.usageFile)) {
      try {
        const raw = readFileSync(this.usageFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.currentDailyCostUsd === 'number') {
          for (const field of ['currentDailyCostUsd', 'currentMonthlyCostUsd', 'totalRunsToday', 'totalTokensToday']) amount(parsed[field], field);
          if (typeof parsed.lastResetDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.lastResetDay) || typeof parsed.lastResetMonth !== 'string' || !/^\d{4}-\d{2}$/.test(parsed.lastResetMonth)) throw new Error('Missing or invalid budget reset dates');
          if (parsed.requestAttemptsToday !== undefined) amount(parsed.requestAttemptsToday, 'requestAttemptsToday');
          for (const field of ['providerDailyCostUsd', 'modelDailyCostUsd']) {
            for (const [id, value] of entries(parsed[field] ?? {}, field)) { identifier(id, field); amount(value, field); }
          }
          for (const [id, value] of entries(parsed.runSpend ?? {}, 'runSpend')) {
            identifier(id, 'runId');
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid run spend');
            const run = value as RunSpend;
            amount(run.costUsd, 'run cost'); amount(run.tokens, 'run tokens'); amount(run.startedAt, 'run startedAt');
            if (run.maxCostUsd !== undefined) amount(run.maxCostUsd, 'run maxCostUsd');
            if (run.finished !== undefined && typeof run.finished !== 'boolean') throw new Error('run finished must be a boolean');
            this.runs.set(id, run);
          }
          for (const [id, value] of entries(parsed.reservations ?? {}, 'reservations')) {
            identifier(id, 'reservationId');
            validateReservation(value);
            if (!this.runs.has(value.runId)) throw new Error('Reservation references an unknown run');
            this.reservations.set(id, value);
          }
          // An interrupted request may already have been billed. Conservatively
          // retain its reservation as spend; do not silently restore allowance.
          for (const reservation of this.reservations.values()) {
            parsed.currentDailyCostUsd += reservation.estimatedCostUsd;
            parsed.currentMonthlyCostUsd += reservation.estimatedCostUsd;
            parsed.totalTokensToday += reservation.estimatedTokens;
            parsed.providerDailyCostUsd ||= {};
            parsed.modelDailyCostUsd ||= {};
            parsed.providerDailyCostUsd[reservation.provider] = (parsed.providerDailyCostUsd[reservation.provider] || 0) + reservation.estimatedCostUsd;
            parsed.modelDailyCostUsd[reservation.model] = (parsed.modelDailyCostUsd[reservation.model] || 0) + reservation.estimatedCostUsd;
            const run = this.runs.get(reservation.runId);
            if (run) { run.costUsd += reservation.estimatedCostUsd; run.tokens += reservation.estimatedTokens; }
          }
          this.reservations.clear();
          delete parsed.runSpend;
          delete parsed.reservations;
          return parsed;
        }
        throw new Error('Invalid budget ledger');
      } catch (error) { throw new Error(`Cannot safely load budget ledger: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return {
      currentDailyCostUsd: 0,
      currentMonthlyCostUsd: 0,
      totalRunsToday: 0,
      totalTokensToday: 0,
      lastResetDay: this.todayDate(),
      lastResetMonth: this.currentMonth(),
      providerDailyCostUsd: {},
      modelDailyCostUsd: {},
      requestAttemptsToday: 0,
    };
  }

  private saveUsage(): void {
    mkdirSync(dirname(this.usageFile), { recursive: true });
    const temporary = `${this.usageFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ ...this.usage, runSpend: Object.fromEntries(this.runs), reservations: Object.fromEntries(this.reservations) }, null, 2), { mode: 0o600 });
    renameSync(temporary, this.usageFile);
  }

  private checkRollover(): void {
    const today = this.todayDate();
    const month = this.currentMonth();

    let changed = false;
    if (this.usage.lastResetDay !== today) {
      this.usage.currentDailyCostUsd = 0;
      this.usage.totalRunsToday = 0;
      this.usage.totalTokensToday = 0;
      this.usage.providerDailyCostUsd = {};
      this.usage.modelDailyCostUsd = {};
      this.usage.requestAttemptsToday = 0;
      this.usage.lastResetDay = today;
      changed = true;
    }

    if (this.usage.lastResetMonth !== month) {
      this.usage.currentMonthlyCostUsd = 0;
      this.usage.lastResetMonth = month;
      changed = true;
    }

    if (changed) {
      this.saveUsage();
    }
  }

  getConfig(): BudgetConfig {
    return structuredClone(this.config);
  }

  updateConfig(updated: Partial<BudgetConfig>): BudgetConfig {
    const next = { ...this.config, ...updated };
    validateConfig(next);
    this.config = structuredClone(next);
    return this.getConfig();
  }

  getUsage(): BudgetUsage {
    this.checkRollover();
    return structuredClone(this.usage);
  }

  getStatus(): {
    config: BudgetConfig;
    usage: BudgetUsage;
    dailyPercent: number;
    monthlyPercent: number;
    dailyWarning: boolean;
    monthlyWarning: boolean;
    dailyExceeded: boolean;
    monthlyExceeded: boolean;
  } {
    this.checkRollover();
    const dailyPercent = this.config.dailyBudgetUsd > 0
      ? Math.round((this.usage.currentDailyCostUsd / this.config.dailyBudgetUsd) * 100)
      : 0;
    const monthlyPercent = this.config.monthlyBudgetUsd > 0
      ? Math.round((this.usage.currentMonthlyCostUsd / this.config.monthlyBudgetUsd) * 100)
      : 0;

    const warnThreshold = this.config.warningThresholdPercent;
    const dailyWarning = dailyPercent >= warnThreshold;
    const monthlyWarning = monthlyPercent >= warnThreshold;
    const dailyExceeded = this.config.dailyBudgetUsd > 0 && this.usage.currentDailyCostUsd >= this.config.dailyBudgetUsd;
    const monthlyExceeded = this.config.monthlyBudgetUsd > 0 && this.usage.currentMonthlyCostUsd >= this.config.monthlyBudgetUsd;

    return {
      config: this.getConfig(),
      usage: this.getUsage(),
      dailyPercent,
      monthlyPercent,
      dailyWarning,
      monthlyWarning,
      dailyExceeded,
      monthlyExceeded,
    };
  }

  checkRunBudget(estimatedCostUsd = 0, estimatedTokens = 0): {
    allowed: boolean;
    reason?: string;
    warning?: string;
  } {
    this.checkRollover();
    const status = this.getStatus();

    if (this.config.maxCostPerRunUsd > 0 && estimatedCostUsd > this.config.maxCostPerRunUsd) {
      const msg = `Estimated run cost ($${estimatedCostUsd.toFixed(4)}) exceeds maximum run limit ($${this.config.maxCostPerRunUsd.toFixed(2)})`;
      if (this.config.hardStop) {
        return { allowed: false, reason: msg };
      }
      return { allowed: true, warning: msg };
    }

    if (this.config.maxTokensPerRun > 0 && estimatedTokens > this.config.maxTokensPerRun) {
      const msg = `Estimated tokens (${estimatedTokens}) exceeds maximum run limit (${this.config.maxTokensPerRun})`;
      if (this.config.hardStop) {
        return { allowed: false, reason: msg };
      }
      return { allowed: true, warning: msg };
    }

    if (status.dailyExceeded) {
      const msg = `Daily budget of $${this.config.dailyBudgetUsd.toFixed(2)} exceeded (spent: $${this.usage.currentDailyCostUsd.toFixed(4)})`;
      if (this.config.hardStop) {
        return { allowed: false, reason: msg };
      }
      return { allowed: true, warning: msg };
    }

    if (status.monthlyExceeded) {
      const msg = `Monthly budget of $${this.config.monthlyBudgetUsd.toFixed(2)} exceeded (spent: $${this.usage.currentMonthlyCostUsd.toFixed(4)})`;
      if (this.config.hardStop) {
        return { allowed: false, reason: msg };
      }
      return { allowed: true, warning: msg };
    }

    let warning: string | undefined;
    if (status.dailyWarning) {
      warning = `Daily budget warning: ${status.dailyPercent}% consumed ($${this.usage.currentDailyCostUsd.toFixed(4)} of $${this.config.dailyBudgetUsd.toFixed(2)})`;
    } else if (status.monthlyWarning) {
      warning = `Monthly budget warning: ${status.monthlyPercent}% consumed ($${this.usage.currentMonthlyCostUsd.toFixed(4)} of $${this.config.monthlyBudgetUsd.toFixed(2)})`;
    }

    return { allowed: true, warning };
  }

  recordSpend(costUsd: number, tokens = 0): void {
    amount(costUsd, 'costUsd');
    amount(tokens, 'tokens');
    this.checkRollover();
    this.usage.currentDailyCostUsd = Math.round((this.usage.currentDailyCostUsd + costUsd) * 1e6) / 1e6;
    this.usage.currentMonthlyCostUsd = Math.round((this.usage.currentMonthlyCostUsd + costUsd) * 1e6) / 1e6;
    this.usage.totalRunsToday += 1;
    this.usage.totalTokensToday += tokens;
    this.saveUsage();
  }

  beginRun(runId: string, initial?: { costUsd?: number; tokens?: number; maxCostUsd?: number }): void {
    this.checkRollover();
    identifier(runId, 'runId');
    if (initial?.costUsd !== undefined) amount(initial.costUsd, 'initial costUsd');
    if (initial?.tokens !== undefined) amount(initial.tokens, 'initial tokens');
    if (initial?.maxCostUsd !== undefined) amount(initial.maxCostUsd, 'maxCostUsd');
    const existing = this.runs.get(runId);
    if (existing) {
      if (initial?.maxCostUsd && (!existing.maxCostUsd || initial.maxCostUsd < existing.maxCostUsd)) { existing.maxCostUsd = initial.maxCostUsd; this.saveUsage(); }
      return;
    }
    this.runs.set(runId, { costUsd: initial?.costUsd || 0, tokens: initial?.tokens || 0, startedAt: Date.now(), maxCostUsd: initial?.maxCostUsd });
    this.usage.totalRunsToday++;
    this.saveUsage();
  }

  finishRun(runId: string): void {
    const run = this.runs.get(runId);
    if (run) run.finished = true;
    // Preserve recent IDs for idempotence and paused runs for cumulative limits.
    if (this.runs.size > 1000) {
      for (const [id, value] of this.runs) {
        if (value.finished && ![...this.reservations.values()].some(r => r.runId === id)) this.runs.delete(id);
        if (this.runs.size <= 1000) break;
      }
    }
    this.saveUsage();
  }

  remainingTokens(runId: string): number {
    if (!this.config.hardStop || this.config.maxTokensPerRun <= 0) return Infinity;
    const reserved = [...this.reservations.values()].filter(r => r.runId === runId).reduce((sum, r) => sum + r.estimatedTokens, 0);
    return Math.max(0, this.config.maxTokensPerRun - (this.runs.get(runId)?.tokens || 0) - reserved);
  }

  getRunSpend(runId: string): { costUsd: number; tokens: number } {
    const run = this.runs.get(runId);
    return { costUsd: run?.costUsd || 0, tokens: run?.tokens || 0 };
  }

  reserve(request: Reservation): { reservationId: string; warning?: string } {
    this.checkRollover();
    validateReservation(request);
    this.beginRun(request.runId);
    const run = this.runs.get(request.runId)!;
    const pending = [...this.reservations.values()];
    const sum = (filter: (r: Reservation) => boolean, key: 'estimatedCostUsd' | 'estimatedTokens' = 'estimatedCostUsd') => pending.filter(filter).reduce((total, r) => total + r[key], 0);
    const projectedRunCost = run.costUsd + sum(r => r.runId === request.runId) + request.estimatedCostUsd;
    const projectedRunTokens = run.tokens + sum(r => r.runId === request.runId, 'estimatedTokens') + request.estimatedTokens;
    const failures: string[] = [];
    const check = (limit: number | undefined, projected: number, label: string) => { if (limit !== undefined && limit > 0 && projected > limit + 1e-10) failures.push(`${label} limit ${limit} would be exceeded (${projected})`); };
    check(this.config.maxCostPerRunUsd, projectedRunCost, 'Run cost');
    check(run.maxCostUsd, projectedRunCost, 'Repository run cost');
    check(this.config.maxTokensPerRun, projectedRunTokens, 'Run tokens');
    check(this.config.dailyBudgetUsd, this.usage.currentDailyCostUsd + sum(() => true) + request.estimatedCostUsd, 'Daily budget');
    check(this.config.monthlyBudgetUsd, this.usage.currentMonthlyCostUsd + sum(() => true) + request.estimatedCostUsd, 'Monthly budget');
    check(this.config.providerLimits?.[request.provider as keyof NonNullable<BudgetConfig['providerLimits']>], (this.usage.providerDailyCostUsd?.[request.provider] || 0) + sum(r => r.provider === request.provider) + request.estimatedCostUsd, 'Provider daily budget');
    check(this.config.modelLimits?.[request.model], (this.usage.modelDailyCostUsd?.[request.model] || 0) + sum(r => r.model === request.model) + request.estimatedCostUsd, 'Model daily budget');
    if (failures.length && this.config.hardStop) throw new BudgetExceededError(failures.join('; '));
    const reservationId = `reservation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.reservations.set(reservationId, { ...request });
    this.usage.requestAttemptsToday = (this.usage.requestAttemptsToday || 0) + 1;
    this.saveUsage();
    return { reservationId, warning: failures.length ? failures.join('; ') : this.checkRunBudget().warning };
  }

  settle(reservationId: string, spend: { costUsd: number; tokens: number }): void {
    amount(spend.costUsd, 'costUsd');
    amount(spend.tokens, 'tokens');
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return;
    this.checkRollover();
    this.reservations.delete(reservationId);
    const run = this.runs.get(reservation.runId)!;
    run.costUsd += spend.costUsd;
    run.tokens += spend.tokens;
    this.usage.currentDailyCostUsd += spend.costUsd;
    this.usage.currentMonthlyCostUsd += spend.costUsd;
    this.usage.totalTokensToday += spend.tokens;
    this.usage.providerDailyCostUsd ||= {};
    this.usage.modelDailyCostUsd ||= {};
    this.usage.providerDailyCostUsd[reservation.provider] = (this.usage.providerDailyCostUsd[reservation.provider] || 0) + spend.costUsd;
    this.usage.modelDailyCostUsd[reservation.model] = (this.usage.modelDailyCostUsd[reservation.model] || 0) + spend.costUsd;
    this.saveUsage();
  }

  release(reservationId: string): void {
    if (this.reservations.delete(reservationId)) this.saveUsage();
  }
}
