import { describe, it, expect } from "vitest";
import { computeMetrics, rankByEngagement } from "./metrics";
import type { CompetitorChannel } from "./types";

function channel(posts: CompetitorChannel["posts"]): CompetitorChannel {
  return { handle: "x", url: "https://youtube.com/@x", platform: "youtube", posts };
}

describe("computeMetrics", () => {
  it("computes engagement, cadence, formats, and averages", () => {
    const m = computeMetrics(
      channel([
        { title: "a", views: 1000, likes: 100, comments: 0, publishedAt: "2026-06-01T00:00:00Z", durationSec: 30 },
        { title: "b", views: 1000, likes: 300, comments: 0, publishedAt: "2026-06-08T00:00:00Z", durationSec: 120 },
      ]),
    );
    expect(m.sampleSize).toBe(2);
    expect(m.avgViews).toBe(1000);
    // (0.1 + 0.3) / 2 = 0.2
    expect(m.engagementRate).toBe(0.2);
    // 2 posts over a 1-week span = 2/week
    expect(m.postsPerWeek).toBe(2);
    expect(m.topFormats).toEqual(["short", "long"]);
  });

  it("handles an empty channel without dividing by zero", () => {
    const m = computeMetrics(channel([]));
    expect(m).toMatchObject({ sampleSize: 0, avgViews: 0, engagementRate: 0, postsPerWeek: 0, topFormats: [] });
  });

  it("treats a single post as a count, not a rate", () => {
    const m = computeMetrics(
      channel([
        { title: "a", views: 500, likes: 50, comments: 5, publishedAt: "2026-06-01T00:00:00Z", durationSec: 45 },
      ]),
    );
    expect(m.postsPerWeek).toBe(1);
    expect(m.topFormats).toEqual(["short"]);
  });
});

describe("rankByEngagement", () => {
  it("orders by engagement desc, breaking ties on avg views", () => {
    const base = { handle: "", url: "", platform: "youtube" as const, sampleSize: 1, postsPerWeek: 1, topFormats: [] };
    const ranked = rankByEngagement([
      { ...base, handle: "low", engagementRate: 0.1, avgViews: 100 },
      { ...base, handle: "tieB", engagementRate: 0.3, avgViews: 200 },
      { ...base, handle: "tieA", engagementRate: 0.3, avgViews: 900 },
    ]);
    expect(ranked.map((r) => r.handle)).toEqual(["tieA", "tieB", "low"]);
  });
});
