import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runtimeDir } from './config.js';
import { redactSecrets } from './redact.js';

export interface RunHistoryResult {
  role: string;
  model: string;
  contentHash: string;
  contentLength: number;
  preview: string;
}

export interface RunHistoryEntry {
  id: string;
  startedAt: number;
  completedAt: number;
  strategy: string;
  promptHash: string;
  results: RunHistoryResult[];
}

export class RunHistory {
  private entries: RunHistoryEntry[] = [];
  private readonly file: string;

  constructor(file = join(runtimeDir(), 'orchestrator-runs.json')) {
    this.file = file;
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (Array.isArray(parsed)) this.entries = parsed.slice(-50);
    } catch { /* a corrupt history must never prevent the bridge from starting */ }
  }

  add(
    strategy: string,
    prompt: string,
    results: Array<{ role: string; model: string; content: string }>,
    startedAt: number,
  ): RunHistoryEntry {
    const entry: RunHistoryEntry = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      completedAt: Date.now(),
      strategy,
      promptHash: createHash('sha256').update(prompt).digest('hex').slice(0, 16),
      results: results.map(result => ({
        role: result.role,
        model: result.model,
        contentHash: createHash('sha256').update(result.content).digest('hex').slice(0, 16),
        contentLength: result.content.length,
        preview: redactSecrets(result.content).slice(0, 240),
      })),
    };
    this.entries.push(entry);
    this.entries = this.entries.slice(-50);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    chmodSync(this.file, 0o600);
    return entry;
  }

  snapshot(): RunHistoryEntry[] { return [...this.entries].reverse(); }
}
