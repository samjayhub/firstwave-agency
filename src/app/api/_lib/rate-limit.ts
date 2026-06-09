// Rate-limit instances + helpers for the auth routes. In-memory for MVP; swap to
// a Redis-backed RateLimiter at multi-instance scale.
import { AppError } from "@/lib/errors/app-error";
import { InMemoryRateLimiter, type RateLimiter } from "@/lib/security/rate-limiter";

const MIN = 60_000;

// 10 login attempts / 15 min, 5 signups / hour — per key (IP and/or email).
export const loginLimiter = new InMemoryRateLimiter(10, 15 * MIN);
export const signupLimiter = new InMemoryRateLimiter(5, 60 * MIN);
// Team invites create accounts — throttle per agency to 20/hour.
export const teamInviteLimiter = new InMemoryRateLimiter(20, 60 * MIN);
// Brand extraction is the most expensive endpoint (headless browser + LLM):
// 6 per agency/client per hour.
export const brandExtractLimiter = new InMemoryRateLimiter(6, 60 * MIN);
// LLM-cost-bearing content endpoints, keyed per agency+client/item.
export const contentPlanLimiter = new InMemoryRateLimiter(10, 60 * MIN);
export const copyGenLimiter = new InMemoryRateLimiter(60, 60 * MIN);
// Image generation (metered creative compute).
export const imageGenLimiter = new InMemoryRateLimiter(30, 60 * MIN);
// Design Director fans out to 4 LLM specialist agents per run — 10 per
// agency+item per hour.
export const designLimiter = new InMemoryRateLimiter(10, 60 * MIN);
// Video production is the most expensive path (script LLM + N image gens + TTS +
// assembly) — 3 per agency+item per hour.
export const videoGenLimiter = new InMemoryRateLimiter(3, 60 * MIN);
// Publishing reaches a real social network — throttle per agency+item.
export const publishLimiter = new InMemoryRateLimiter(20, 60 * MIN);
// Research triggers an LLM call per job — 6 per agency+client per hour.
export const researchLimiter = new InMemoryRateLimiter(6, 60 * MIN);
// Analytics refresh hits a platform API per published post — 30 per
// agency+job per hour.
export const analyticsLimiter = new InMemoryRateLimiter(30, 60 * MIN);
// Competitor sweep fans out to the YouTube API + an LLM synthesis — 6 per
// agency+client per hour.
export const competitorLimiter = new InMemoryRateLimiter(6, 60 * MIN);
// Trend sweep fans out to Google Trends + an LLM synthesis — 6 per
// agency+client per hour.
export const trendLimiter = new InMemoryRateLimiter(6, 60 * MIN);
// Manual scheduler tick (ops trigger; the cron heartbeat is the normal path) —
// 12 per agency per hour.
export const schedulerTickLimiter = new InMemoryRateLimiter(12, 60 * MIN);

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
