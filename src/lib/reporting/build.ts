// Pure aggregation for agency reports (P4-07). Turns a client's published-post
// snapshots into per-platform rollups + top posts. No I/O — unit-tested directly.
//
// AUDIT-EXEMPT: deterministic arithmetic over already-stored metrics.
import type { Platform } from "@/lib/publishers/types";
import { engagementScore } from "@/lib/performance";
import type { PerformanceReport, PlatformAgg, ReportSnapshotRow, TopPost } from "./types";

const TOP_POSTS = 5;

export function buildReport(
  clientId: string,
  clientName: string,
  rows: ReportSnapshotRow[],
  periodDays: number,
  now: Date,
): PerformanceReport {
  const byPlatform = new Map<Platform, PlatformAgg>();
  const totals = { posts: 0, impressions: 0, likes: 0, comments: 0, shares: 0 };

  for (const row of rows) {
    const m = row.metrics;
    const agg =
      byPlatform.get(row.platform) ??
      { platform: row.platform, posts: 0, impressions: 0, likes: 0, comments: 0, shares: 0 };
    agg.posts += 1;
    agg.impressions += m.impressions ?? 0;
    agg.likes += m.likes ?? 0;
    agg.comments += m.comments ?? 0;
    agg.shares += m.shares ?? 0;
    byPlatform.set(row.platform, agg);

    totals.posts += 1;
    totals.impressions += m.impressions ?? 0;
    totals.likes += m.likes ?? 0;
    totals.comments += m.comments ?? 0;
    totals.shares += m.shares ?? 0;
  }

  const topPosts: TopPost[] = rows
    .filter((r) => r.idea && r.idea.trim())
    .map((r) => ({
      idea: r.idea!.trim(),
      platform: r.platform,
      impressions: r.metrics.impressions ?? 0,
      engagement: Math.round(engagementScore(r.metrics) * 1000) / 1000,
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, TOP_POSTS);

  return {
    clientId,
    clientName,
    periodDays,
    generatedAt: now.toISOString(),
    totals,
    byPlatform: [...byPlatform.values()].sort((a, b) => b.impressions - a.impressions),
    topPosts,
  };
}
