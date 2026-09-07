import { randomUUID, createHash } from 'node:crypto';
import type { StateStore } from './storage.js';
import type { ChatRequest } from './types.js';
import { abortable, estimateCost, estimateTokens } from './usage.js';
import { redactSecrets } from './redact.js';

const RUNS = 'platform.runs';
const ARTIFACTS = 'platform.artifacts';
const MAX_QUEUE = 100;
export type PlatformRunStatus = 'queued' | 'waiting_approval' | 'running' | 'completed' | 'exhausted' | 'failed' | 'cancelled' | 'interrupted';
export interface PlatformRunInput {
  prompt: string;
  model: string;
  profileId?: string;
  agentId?: string;
  workspaceId?: string;
  repository?: string;
  workingDirectory?: string;
  mode?: 'chat' | 'plan' | 'agent';
  maxIterations?: number;
  maxDurationMs?: number;
  maxCostUsd?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  successPattern?: string;
  requiresApproval?: boolean;
  idempotencyKey?: string;
  /** Resolved, version-pinned instructions. HTTP callers cannot directly set this field. */
  instructions?: string;
  skillRefs?: { id: string; version: number }[];
  ownerId?: string;
  /** Fingerprint of the credential that authorized queuing, supplied by the HTTP layer. */
  authorizationVersion?: string;
}
export interface PlatformRunIteration {
  iteration: number;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed';
  content?: string;
  error?: string;
  contentHash?: string;
  artifactId?: string;
}
export interface PlatformArtifact {
  id: string;
  runId: string;
  name: string;
  mediaType: string;
  content: string;
  sizeBytes: number;
  sha256: string;
  createdAt: number;
}
export interface PlatformRun {
  id: string;
  revision: number;
  status: PlatformRunStatus;
  input: PlatformRunInput;
  prompt: string;
  model: string;
  agentId?: string;
  workspaceId?: string;
  maxIterations: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  ownerPid?: number;
  steps: PlatformRunIteration[];
  artifacts: Omit<PlatformArtifact, 'content'>[];
  error?: string;
  stopReason?: string;
  costUsd: number;
  tokensConsumed: number;
  approval?: { operator: string; decision: 'approved' | 'rejected'; time: number; feedback?: string };
  retryOf?: string;
}
export class PlatformRunError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'invalid_request') { super(message); }
}
export interface PlatformRunRuntime {
  execute(request: ChatRequest, context: { run: PlatformRun; iteration: number }): Promise<string>;
  begin?(run: PlatformRun): void;
  finish?(run: PlatformRun): void;
  spend?(id: string): { costUsd: number; tokens: number };
  /** Return undefined when concurrency is busy; the queued job is retried later. */
  acquire?(): (() => void) | undefined;
  onUpdate?(run: PlatformRun): void;
  concurrency?: number;
  now?: () => number;
}
function bounded(value: unknown, fallback: number, low: number, high: number, name: string): number {
  const n = value ?? fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < low || n > high) throw new PlatformRunError(`${name} must be between ${low} and ${high}`);
  return n;
}
function validate(input: PlatformRunInput): PlatformRunInput {
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 50000) throw new PlatformRunError('A prompt of at most 50000 characters is required');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200) throw new PlatformRunError('A model is required');
  const result = structuredClone(input);
  result.mode ??= 'chat';
  if (!['chat', 'plan', 'agent'].includes(result.mode)) throw new PlatformRunError('Invalid execution mode');
  result.maxIterations = bounded(input.maxIterations, 1, 1, 10, 'maxIterations');
  result.maxDurationMs = bounded(input.maxDurationMs, 120000, 100, 1800000, 'maxDurationMs');
  result.maxCostUsd = bounded(input.maxCostUsd, 0.5, 0, 100, 'maxCostUsd');
  result.maxTokens = bounded(input.maxTokens, 20000, 1, 500000, 'maxTokens');
  result.maxOutputTokens = bounded(input.maxOutputTokens, 1024, 1, 8192, 'maxOutputTokens');
  for (const field of ['maxIterations', 'maxTokens', 'maxOutputTokens', 'maxDurationMs'] as const) if (!Number.isInteger(result[field])) throw new PlatformRunError(`${field} must be an integer`);
  if (result.successPattern !== undefined && (typeof result.successPattern !== 'string' || !result.successPattern.trim() || result.successPattern.length > 200)) throw new PlatformRunError('successPattern must be a literal nonempty string up to 200 characters');
  if (result.idempotencyKey !== undefined && !/^[\w.:-]{1,120}$/.test(result.idempotencyKey)) throw new PlatformRunError('Invalid idempotencyKey');
  if (result.requiresApproval !== undefined && typeof result.requiresApproval !== 'boolean') throw new PlatformRunError('requiresApproval must be boolean');
  return result;
}

/** Single-host durable queue. Interrupted side effects never auto-replay. */
export class PlatformRunService {
  private active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private pumping = false;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly now: () => number;
  constructor(private readonly store: StateStore, private runtime: PlatformRunRuntime) { this.now = runtime.now ?? Date.now; }

  async start(): Promise<void> {
    await this.store.ready();
    for (const run of this.list()) {
      if (run.status !== 'running') continue;
      // A second embedding process cannot interrupt a known live owner's execution.
      if (run.ownerPid && run.ownerPid !== process.pid) {
        try { process.kill(run.ownerPid, 0); continue; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue; }
      }
      run.status = 'interrupted'; run.completedAt = this.now(); run.stopReason = 'Process restarted. Inspect side effects before starting another run.';
      for (const step of run.steps) if (step.status === 'running') { step.status = 'failed'; step.error = 'Execution interrupted'; step.completedAt = this.now(); }
      await this.save(run);
    }
    this.schedule();
  }
  list(): PlatformRun[] { return this.store.list<PlatformRun>(RUNS).sort((a, b) => b.createdAt - a.createdAt); }
  get(id: string): PlatformRun | undefined { return this.store.read<PlatformRun>(RUNS, id); }
  getArtifact(id: string): PlatformArtifact | undefined { return this.store.read<PlatformArtifact>(ARTIFACTS, id); }
  private require(id: string): PlatformRun { const run = this.get(id); if (!run) throw new PlatformRunError('Run not found', 404, 'not_found'); return run; }
  private async save(run: PlatformRun, artifacts: PlatformArtifact[] = []): Promise<void> {
    const expected = run.revision;
    const next = { ...structuredClone(run), revision: expected + 1 };
    await this.store.transaction(tx => {
      const current = tx.read<PlatformRun>(RUNS, run.id);
      if (current && current.revision !== expected) throw new PlatformRunError('Run changed; reload and retry', 409, 'revision_conflict');
      tx.put(RUNS, next.id, next);
      for (const artifact of artifacts) tx.put(ARTIFACTS, artifact.id, artifact);
    });
    // Keep references held by the executor (such as the current step) attached
    // to its working run. Storage owns a clone; only the revision changes here.
    run.revision = next.revision;
    try { this.runtime.onUpdate?.(structuredClone(run)); } catch { /* observers cannot fail a committed transition */ }
  }
  async create(input: PlatformRunInput): Promise<PlatformRun> {
    if (this.stopped) throw new PlatformRunError('Run queue is stopping', 503);
    const validated = validate(input);
    const fingerprint = JSON.stringify({ ...validated, idempotencyKey: undefined });
    let result!: PlatformRun;
    await this.store.transaction(tx => {
      const runs = tx.list<PlatformRun>(RUNS);
      const existing = validated.idempotencyKey && runs.find(r => r.input.idempotencyKey === validated.idempotencyKey && r.input.ownerId === validated.ownerId);
      if (existing) {
        if (JSON.stringify({ ...existing.input, idempotencyKey: undefined }) !== fingerprint) throw new PlatformRunError('Idempotency key belongs to different run input', 409, 'idempotency_conflict');
        result = existing; return;
      }
      if (runs.filter(r => ['queued', 'waiting_approval', 'running'].includes(r.status)).length >= MAX_QUEUE) throw new PlatformRunError('Run queue is full', 429, 'queue_full');
      result = {
        id: `run-${randomUUID()}`, revision: 1, input: validated,
        status: validated.requiresApproval ? 'waiting_approval' : 'queued',
        prompt: validated.prompt, model: validated.model, agentId: validated.agentId, workspaceId: validated.workspaceId,
        maxIterations: validated.maxIterations!, createdAt: this.now(), steps: [], artifacts: [], costUsd: 0, tokensConsumed: 0,
      };
      tx.put(RUNS, result.id, result);
    });
    this.schedule();
    return structuredClone(result);
  }
  async action(id: string, action: string, operator: string, feedback?: string): Promise<PlatformRun> {
    let run = this.require(id);
    if (action === 'cancel') {
      const active = this.active.get(id);
      if (active) { active.controller.abort(new Error('Cancelled by operator')); await active.promise; return this.require(id); }
      if (['queued', 'waiting_approval'].includes(run.status)) { run.status = 'cancelled'; run.completedAt = this.now(); run.stopReason = 'Cancelled by operator'; await this.save(run); }
      return run;
    }
    if (action === 'approve' || action === 'reject') {
      if (run.status !== 'waiting_approval') throw new PlatformRunError('This run is not awaiting approval', 409);
      run.approval = { operator, decision: action === 'approve' ? 'approved' : 'rejected', time: this.now(), feedback: feedback ? redactSecrets(feedback.slice(0, 2000)) : undefined };
      run.status = action === 'approve' ? 'queued' : 'cancelled';
      if (action === 'reject') { run.completedAt = this.now(); run.stopReason = 'Approval rejected'; }
      await this.save(run); this.schedule(); return run;
    }
    if (action === 'retry') {
      if (['queued', 'running', 'waiting_approval'].includes(run.status)) throw new PlatformRunError('An active run cannot be retried', 409);
      if (run.input.mode === 'agent') throw new PlatformRunError('Agent runs may have side effects. Inspect the workspace and explicitly create a new run.', 409, 'side_effect_review_required');
      const next = await this.create({ ...run.input, idempotencyKey: undefined }); next.retryOf = id; await this.save(next); return next;
    }
    throw new PlatformRunError('Unknown run action');
  }
  private schedule(delay = 0): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.pump(); }, delay); this.timer.unref();
  }
  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      for (const run of this.list().filter(r => r.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)) {
        if (this.active.size >= (this.runtime.concurrency ?? 2)) break;
        const release = this.runtime.acquire ? this.runtime.acquire() : () => {};
        if (!release) break;
        const controller = new AbortController();
        const promise = this.execute(run, controller).catch(() => {}).finally(() => { release(); this.active.delete(run.id); this.schedule(); });
        this.active.set(run.id, { controller, promise });
      }
    } finally {
      this.pumping = false;
      if (!this.stopped && this.list().some(r => r.status === 'queued')) this.schedule(500);
    }
  }
  private async execute(run: PlatformRun, controller: AbortController): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      run.status = 'running'; run.startedAt = this.now(); run.ownerPid = process.pid;
      await this.save(run);
      this.runtime.begin?.(run);
      timer = setTimeout(() => controller.abort(new Error('Run deadline exceeded')), run.input.maxDurationMs); timer.unref();
      const fingerprints = new Set<string>();
      let prior = '';
      for (let iteration = 1; iteration <= run.maxIterations; iteration++) {
        controller.signal.throwIfAborted();
        const messages: ChatRequest['messages'] = [
          { role: 'system', content: [run.input.instructions || 'Complete the requested task and provide concise, verifiable evidence.',
            `This run has at most ${run.maxIterations} iterations. Do not claim tools or tests ran unless they actually did.`,
            run.input.successPattern ? `Only include the success marker "${run.input.successPattern}" when the stated task is complete.` : '',
          ].filter(Boolean).join('\n') },
          { role: 'user', content: run.prompt },
          ...(prior ? [{ role: 'assistant' as const, content: prior }, { role: 'user' as const, content: 'Review the previous result against the original task. Repair remaining issues and report fresh evidence. Do not repeat unchanged work.' }] : []),
        ];
        const inputTokens = estimateTokens(messages.map(m => m.content).join('\n'));
        const maxOutput = Math.min(run.input.maxOutputTokens!, run.input.maxTokens! - run.tokensConsumed - inputTokens);
        if (maxOutput <= 0) throw new PlatformRunError('Run token budget exhausted', 402, 'budget_exceeded');
        if (run.costUsd + estimateCost(run.model, inputTokens, maxOutput) > run.input.maxCostUsd!) throw new PlatformRunError('Run cost reservation exceeds its limit', 402, 'budget_exceeded');
        const step: PlatformRunIteration = { iteration, startedAt: this.now(), status: 'running' }; run.steps.push(step); await this.save(run);
        const content = await abortable(this.runtime.execute({ model: run.model, messages, mode: run.input.mode, cwd: run.input.workingDirectory, max_tokens: maxOutput, signal: controller.signal }, { run: structuredClone(run), iteration }), controller.signal);
        controller.signal.throwIfAborted();
        if (typeof content !== 'string' || content.length > maxOutput * 4) throw new PlatformRunError('Provider output exceeded the run output limit');
        const measured = this.runtime.spend?.(run.id);
        run.tokensConsumed = measured?.tokens ?? run.tokensConsumed + inputTokens + estimateTokens(content);
        run.costUsd = measured?.costUsd ?? run.costUsd + estimateCost(run.model, inputTokens, estimateTokens(content));
        const digest = createHash('sha256').update(content.trim()).digest('hex');
        const artifact: PlatformArtifact = { id: `artifact-${randomUUID()}`, runId: run.id, name: `iteration-${iteration}.md`, mediaType: 'text/markdown', content, sizeBytes: Buffer.byteLength(content), sha256: digest, createdAt: this.now() };
        Object.assign(step, { status: 'completed', content, completedAt: this.now(), contentHash: digest, artifactId: artifact.id });
        const { content: _privateContent, ...metadata } = artifact; run.artifacts.push(metadata);
        await this.save(run, [artifact]);
        if (!run.input.successPattern || content.includes(run.input.successPattern)) { run.status = 'completed'; run.stopReason = run.input.successPattern ? 'Success marker found' : 'Requested iteration completed'; break; }
        if (fingerprints.has(digest)) { run.status = 'exhausted'; run.stopReason = 'No progress: repeated output'; break; }
        fingerprints.add(digest); prior = content;
        if (iteration === run.maxIterations) { run.status = 'exhausted'; run.stopReason = 'Iteration limit reached without the success marker'; }
      }
      run.completedAt = this.now(); await this.save(run);
    } catch (error) {
      run.status = controller.signal.aborted ? 'cancelled' : 'failed';
      run.error = redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 2000);
      run.completedAt = this.now();
      const step = run.steps.at(-1); if (step?.status === 'running') { step.status = 'failed'; step.error = run.error; step.completedAt = this.now(); }
      const spend = this.runtime.spend?.(run.id); if (spend) { run.costUsd = spend.costUsd; run.tokensConsumed = spend.tokens; }
      await this.save(run);
    } finally { if (timer) clearTimeout(timer); this.runtime.finish?.(run); }
  }
  async stop(): Promise<void> {
    this.stopped = true; if (this.timer) clearTimeout(this.timer);
    for (const { controller } of this.active.values()) controller.abort(new Error('Bridge is stopping'));
    await Promise.allSettled([...this.active.values()].map(a => a.promise));
  }
  async delete(id: string): Promise<void> {
    const run = this.require(id);
    if (['running', 'queued', 'waiting_approval'].includes(run.status)) throw new PlatformRunError('Cancel active work before deleting it', 409);
    await this.store.transaction(tx => { tx.delete(RUNS, id); for (const artifact of run.artifacts) tx.delete(ARTIFACTS, artifact.id); });
  }
}
