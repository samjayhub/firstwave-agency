// Pure ranking math for the learning loop (P4-02). Turns raw per-post metrics
// into an engagement score and a compact brief of what performed. No I/O, no
// LLM — deterministic and unit-tested in isolation.
//
// AUDIT-EXEMPT: deterministic ranking, not a generative/LLM action. The brief it
// produces is later fed INTO an (audited) planner LLM call.
import type { PostMetrics } from "@/lib/analytics/types";
import type { PerformanceBrief, PerformanceRecord } from "./types";

/**
 * Weighted engagement score. Active engagement (shares > comments > likes) is
 * worth far more than passive reach; impressions are a tiny tiebreaker so two
 * otherwise-equal posts order by exposure.
 */
export function engagementScore(m: PostMetrics): number {
  return (
    (m.likes ?? 0) +
    2 * (m.comments ?? 0) +
    3 * (m.shares ?? 0) +
    0.001 * (m.impressions ?? 0)
  );
}

/** Distinct, non-empty values from records already sorted best-first, capped. */
function topDistinct(
  records: PerformanceRecord[],
  pick: (r: PerformanceRecord) => string | undefined,
  max: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of records) {
    const value = pick(r)?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Summarize published-post performance into a planner-ready brief. Returns null
 * when there is nothing to learn from yet, so callers can cleanly skip injection.
 */
export function summarizePerformance(
  records: PerformanceRecord[],
  opts: { topN?: number } = {},
): PerformanceBrief | null {
  if (records.length === 0) return null;

  const topN = opts.topN ?? 5;
  const ranked = records
    .map((r) => ({ record: r, score: engagementScore(r.metrics) }))
    .sort((a, b) => b.score - a.score);
  const rankedRecords = ranked.map((r) => r.record);

  const highlights = ranked
    .filter((r) => r.record.idea && r.record.idea.trim().length > 0)
    .slice(0, topN)
    .map((r) => ({
      idea: r.record.idea!.trim(),
      platform: r.record.platform,
      // Round so the prompt stays compact and deterministic.
      score: Math.round(r.score * 1000) / 1000,
    }));

  return {
    topPillars: topDistinct(rankedRecords, (r) => r.pillar, topN),
    topFormats: topDistinct(rankedRecords, (r) => r.format, topN),
    highlights,
    sampleSize: records.length,
  };
}
