import { describe, expect, it } from "vitest";
import { buildReport } from "./build";
import type { ReportSnapshotRow } from "./types";

const NOW = new Date("2026-06-09T00:00:00Z");
const row = (o: Partial<ReportSnapshotRow>): ReportSnapshotRow => ({
  platform: "linkedin",
  metrics: {},
  capturedAt: NOW,
  ...o,
});

describe("buildReport", () => {
  it("aggregates totals and per-platform rollups", () => {
    const report = buildReport(
      "c1",
      "Acme",
      [
        row({ platform: "linkedin", metrics: { impressions: 100, likes: 10 } }),
        row({ platform: "linkedin", metrics: { impressions: 50, comments: 2 } }),
        row({ platform: "youtube", metrics: { impressions: 500, shares: 5 } }),
      ],
      30,
      NOW,
    );

    expect(report.totals).toEqual({
      posts: 3,
      impressions: 650,
      likes: 10,
      comments: 2,
      shares: 5,
    });
    // youtube has more impressions → sorts first.
    expect(report.byPlatform[0]!.platform).toBe("youtube");
    const li = report.byPlatform.find((p) => p.platform === "linkedin")!;
    expect(li.posts).toBe(2);
    expect(li.impressions).toBe(150);
  });

  it("ranks top posts by engagement and drops ones without an idea", () => {
    const report = buildReport(
      "c1",
      "Acme",
      [
        row({ idea: "weak", metrics: { likes: 1 } }),
        row({ idea: "strong", metrics: { shares: 20 } }),
        row({ metrics: { likes: 999 } }), // no idea → excluded from topPosts
      ],
      30,
      NOW,
    );
    expect(report.topPosts.map((t) => t.idea)).toEqual(["strong", "weak"]);
  });

  it("handles an empty period", () => {
    const report = buildReport("c1", "Acme", [], 7, NOW);
    expect(report.totals.posts).toBe(0);
    expect(report.byPlatform).toEqual([]);
    expect(report.topPosts).toEqual([]);
    expect(report.generatedAt).toBe(NOW.toISOString());
  });
});
