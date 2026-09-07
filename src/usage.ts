import { randomUUID } from 'node:crypto';
import { BudgetExceededError, type BudgetManager } from './budget.js';
import type { MetricsStore } from './metrics.js';
import type { ChatRequest, ProviderAdapter } from './types.js';

/** A consistent planning estimate, not a provider invoice or published price. */
export const USAGE_ESTIMATE_VERSION = 'bridge-estimate-v1';
export function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = /^(?:lmstudio|bitnet)\//.test(model) ? 0 : /haiku|flash|luna/.test(model) ? 0.000001 : /opus|sol/.test(model) ? 0.000015 : 0.000005;
  return Number(((inputTokens + outputTokens) * rate).toFixed(8));
}

export interface AccountingOptions {
  budgetManager?: BudgetManager;
  metrics?: MetricsStore;
  runId?: string;
  onWarning?: (message: string) => void;
  maxOutputChars?: number;
}

/** Race cancellation even when an adapter fails to observe its supplied signal. */
export async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) {
    // The operation may have rejected synchronously while initiating its abort.
    // Observe that rejection even though cancellation wins this request.
    void operation.catch(() => {});
    signal.throwIfAborted();
  }
  let listener: () => void = () => {};
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      listener = () => reject(signal.reason || new Error('Execution cancelled'));
      signal.addEventListener('abort', listener, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', listener); }
}

/** Begin once, then finish once with the concatenated output (including partial errors). */
export function openExecution(provider: Pick<ProviderAdapter, 'name' | 'models'>, original: ChatRequest, options: AccountingOptions = {}) {
  const runId = options.runId || `request-${randomUUID()}`;
  const ownsRun = !options.runId;
  const budget = options.budgetManager;
  const inputTokens = estimateTokens(original.messages.map(m => m.content).join('\n'));
  const model = Array.isArray(provider.models) ? provider.models.find(m => m.id === original.model) : undefined;
  const outputLimit = original.max_tokens ?? Math.min(model?.maxOutputTokens || 1024, 1024);
  if (!Number.isFinite(outputLimit) || outputLimit <= 0 || !Number.isInteger(outputLimit)) throw new Error('max_tokens must be a positive integer');
  let maxTokens: number;
  let reservation: { reservationId: string; warning?: string } | undefined;
  try {
    budget?.beginRun(runId);
    const available = budget?.remainingTokens(runId) ?? Infinity;
    maxTokens = Math.min(outputLimit, model?.maxOutputTokens || Infinity, available - inputTokens);
    if (maxTokens <= 0) throw new BudgetExceededError('Input exhausts the remaining run token allowance');
    reservation = budget?.reserve({ runId, model: original.model, provider: provider.name, estimatedTokens: inputTokens + maxTokens, estimatedCostUsd: estimateCost(original.model, inputTokens, maxTokens) });
  } catch (error) {
    if (ownsRun) budget?.finishRun(runId);
    throw error;
  }
  if (reservation?.warning) options.onWarning?.(reservation.warning);
  const controller = new AbortController();
  const timeoutMs = budget?.getConfig().maxDurationMs ?? 120000;
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error('Execution deadline exceeded')), timeoutMs) : undefined;
  timer?.unref();
  const signal = original.signal ? AbortSignal.any([original.signal, controller.signal]) : controller.signal;
  const request: ChatRequest = { ...original, max_tokens: maxTokens, signal };
  const finishMetric = options.metrics?.begin(original.model);
  let finished = false;
  const dispose = () => { if (timer) clearTimeout(timer); };
  const finish = (output = '', error?: unknown) => {
    if (finished) return;
    finished = true;
    dispose();
    const outputTokens = estimateTokens(output);
    const costUsd = estimateCost(original.model, inputTokens, outputTokens);
    // Failed requests can still be billable. Retain the full estimate when no
    // output is available instead of claiming the provider consumed nothing.
    const cost = error && !output ? estimateCost(original.model, inputTokens, maxTokens) : costUsd;
    const tokens = error && !output ? inputTokens + maxTokens : inputTokens + outputTokens;
    try {
      if (reservation) budget!.settle(reservation.reservationId, { costUsd: cost, tokens });
      options.metrics?.recordUsage(original.model, inputTokens, tokens - inputTokens, cost);
    } finally {
      finishMetric?.(error);
      if (ownsRun) budget?.finishRun(runId);
    }
  };
  return { request, runId, finish, dispose, maxOutputChars: Math.min(options.maxOutputChars ?? Infinity, maxTokens * 4) };
}

export async function executeWithAccounting(
  provider: ProviderAdapter,
  request: ChatRequest,
  options: AccountingOptions & { execute?: (request: ChatRequest) => Promise<string> } = {},
): Promise<string> {
  const execution = openExecution(provider, request, options);
  let output = '';
  try {
    execution.request.signal?.throwIfAborted();
    output = await abortable(options.execute ? options.execute(execution.request) : provider.chat(execution.request), execution.request.signal);
    if (output.length > execution.maxOutputChars) throw new Error(`Provider output exceeds ${execution.maxOutputChars} character limit`);
    execution.finish(output);
    return output;
  } catch (error) {
    execution.finish(output, error);
    throw error;
  } finally { execution.dispose(); }
}
