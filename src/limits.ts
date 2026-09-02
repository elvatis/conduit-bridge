interface Bucket { started: number; count: number; }

export class RequestLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private active = 0;

  acquire(key: string, perMinute = 60, maxConcurrent = 16): { ok: boolean; reason?: string; release: () => void } {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.started >= 60_000) this.buckets.set(key, { started: now, count: 1 });
    else if (bucket.count >= perMinute) return { ok: false, reason: 'rate limit exceeded', release: () => {} };
    else bucket.count++;
    if (this.active >= maxConcurrent) return { ok: false, reason: 'concurrency limit exceeded', release: () => {} };
    this.active++;
    let released = false;
    return { ok: true, release: () => { if (!released) { released = true; this.active = Math.max(0, this.active - 1); } } };
  }
}
