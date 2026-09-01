import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RunHistoryEntry {
  id: string;
  startedAt: number;
  completedAt: number;
  strategy: string;
  promptHash: string;
  results: Array<{ role: string; model: string; content: string }>;
}

const FILE = join(homedir(), '.conduit', 'orchestrator-runs.json');

export class RunHistory {
  private entries: RunHistoryEntry[] = [];

  constructor() {
    if (!existsSync(FILE)) return;
    try {
      const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
      if (Array.isArray(parsed)) this.entries = parsed.slice(-50);
    } catch { /* a corrupt history must never prevent the bridge from starting */ }
  }

  add(strategy: string, prompt: string, results: RunHistoryEntry['results'], startedAt: number): RunHistoryEntry {
    const entry: RunHistoryEntry = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      completedAt: Date.now(),
      strategy,
      promptHash: createHash('sha256').update(prompt).digest('hex').slice(0, 16),
      results: results.map(result => ({ ...result, content: result.content.slice(0, 12000) })),
    };
    this.entries.push(entry);
    this.entries = this.entries.slice(-50);
    mkdirSync(join(homedir(), '.conduit'), { recursive: true });
    writeFileSync(FILE, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    chmodSync(FILE, 0o600);
    return entry;
  }

  snapshot(): RunHistoryEntry[] { return [...this.entries].reverse(); }
}
