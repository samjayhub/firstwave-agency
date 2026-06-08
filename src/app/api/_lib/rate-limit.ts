// Rate-limit instances + helpers for the auth routes. In-memory for MVP; swap to
// a Redis-backed RateLimiter at multi-instance scale.
import { AppError } from "@/lib/errors/app-error";
import { InMemoryRateLimiter, type RateLimiter } from "@/lib/security/rate-limiter";

const MIN = 60_000;

// 10 login attempts / 15 min, 5 signups / hour — per key (IP and/or email).
export const loginLimiter = new InMemoryRateLimiter(10, 15 * MIN);
export const signupLimiter = new InMemoryRateLimiter(5, 60 * MIN);

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Consume one token for `key`; throw 429 (RATE_LIMITED) when exhausted. */
export async function enforceLimit(limiter: RateLimiter, key: string): Promise<void> {
  const result = await limiter.consume(key);
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", {
      details: { retryAfterMs: result.retryAfterMs },
    });
  }
}
