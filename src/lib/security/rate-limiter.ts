// Sliding-window rate limiter. In-memory implementation for single-instance MVP;
// the same interface is satisfied by a Redis-backed limiter at multi-instance
// scale (REDIS_URL is already provisioned). No timers are used (the arch rule
// bans setInterval/setTimeout for business logic) — expired hits are pruned
// lazily on access.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterMs = recent[0]! + this.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterMs: 0 };
  }
}
