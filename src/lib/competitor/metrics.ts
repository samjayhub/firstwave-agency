// Deterministic ranking/metric maths for the Competitor Engine.
// AUDIT-EXEMPT: pure functions over fetched stats — no generative model call.
import type { CompetitorChannel, CompetitorMetrics, CompetitorPost } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Posts shorter than this are classified "short" (Reels/Shorts/TikTok-style). */
const SHORT_FORMAT_MAX_SEC = 60;

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Mean per-post engagement: (likes + comments) / views, guarding zero views. */
function engagementRate(posts: CompetitorPost[]): number {
  if (posts.length === 0) return 0;
  const rates = posts.map((p) => (p.likes + p.comments) / Math.max(p.views, 1));
  return round(mean(rates), 4);
}

/** Cadence from the span between the earliest and latest sampled post. */
function postsPerWeek(posts: CompetitorPost[]): number {
  if (posts.length <= 1) return posts.length;
  const times = posts.map((p) => new Date(p.publishedAt).getTime()).sort((a, b) => a - b);
  const spanMs = times[times.length - 1]! - times[0]!;
  if (spanMs <= 0) return posts.length;
  return round(posts.length / (spanMs / WEEK_MS), 2);
}

/** Formats present in the sample, most frequent first. */
function topFormats(posts: CompetitorPost[]): string[] {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const fmt = p.durationSec > 0 && p.durationSec <= SHORT_FORMAT_MAX_SEC ? "short" : "long";
    counts.set(fmt, (counts.get(fmt) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([fmt]) => fmt);
}

/** Reduce one fetched channel to its deterministic performance metrics. */
export function computeMetrics(channel: CompetitorChannel): CompetitorMetrics {
  return {
    handle: channel.handle,
    url: channel.url,
    platform: channel.platform,
    sampleSize: channel.posts.length,
    avgViews: Math.round(mean(channel.posts.map((p) => p.views))),
    engagementRate: engagementRate(channel.posts),
    postsPerWeek: postsPerWeek(channel.posts),
    topFormats: topFormats(channel.posts),
  };
}

/** Rank competitors by engagement, highest first; ties broken by avg views. */
export function rankByEngagement(metrics: CompetitorMetrics[]): CompetitorMetrics[] {
  return [...metrics].sort(
    (a, b) => b.engagementRate - a.engagementRate || b.avgViews - a.avgViews,
  );
}
