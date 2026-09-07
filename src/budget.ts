import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
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

export class BudgetManager {
  private config: BudgetConfig;
  private usage: BudgetUsage;
  private readonly usageFile: string;

  constructor(
    initialConfig?: Partial<BudgetConfig>,
    usageFile = join(runtimeDir(), 'budget-usage.json'),
  ) {
    this.config = { ...DEFAULT_BUDGET, ...(initialConfig || {}) };
    this.usageFile = usageFile;
    this.usage = this.loadUsage();
    this.checkRollover();
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
          return parsed;
        }
      } catch { /* ignore parse failure */ }
    }
    return {
      currentDailyCostUsd: 0,
      currentMonthlyCostUsd: 0,
      totalRunsToday: 0,
      totalTokensToday: 0,
      lastResetDay: this.todayDate(),
      lastResetMonth: this.currentMonth(),
    };
  }

  private saveUsage(): void {
    try {
      mkdirSync(dirname(this.usageFile), { recursive: true });
      writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2), { mode: 0o600 });
      chmodSync(this.usageFile, 0o600);
    } catch { /* ignore write failure */ }
  }

  private checkRollover(): void {
    const today = this.todayDate();
    const month = this.currentMonth();

    let changed = false;
    if (this.usage.lastResetDay !== today) {
      this.usage.currentDailyCostUsd = 0;
      this.usage.totalRunsToday = 0;
      this.usage.totalTokensToday = 0;
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
    return { ...this.config };
  }

  updateConfig(updated: Partial<BudgetConfig>): BudgetConfig {
    this.config = { ...this.config, ...updated };
    return { ...this.config };
  }

  getUsage(): BudgetUsage {
    this.checkRollover();
    return { ...this.usage };
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

    const warnThreshold = this.config.warningThresholdPercent || 80;
    const dailyWarning = dailyPercent >= warnThreshold;
    const monthlyWarning = monthlyPercent >= warnThreshold;
    const dailyExceeded = dailyPercent >= 100;
    const monthlyExceeded = monthlyPercent >= 100;

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
    this.checkRollover();
    this.usage.currentDailyCostUsd = Math.round((this.usage.currentDailyCostUsd + costUsd) * 1e6) / 1e6;
    this.usage.currentMonthlyCostUsd = Math.round((this.usage.currentMonthlyCostUsd + costUsd) * 1e6) / 1e6;
    this.usage.totalRunsToday += 1;
    this.usage.totalTokensToday += tokens;
    this.saveUsage();
  }
}
