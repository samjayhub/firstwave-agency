import { describe, expect, it } from "vitest";
import { engagementScore, summarizePerformance } from "./metrics";
import type { PerformanceRecord } from "./types";

const rec = (o: Partial<PerformanceRecord>): PerformanceRecord => ({
  platform: "linkedin",
  metrics: {},
  ...o,
});

describe("engagementScore", () => {
  it("weights shares > comments > likes, with impressions as a tiebreaker", () => {
    expect(engagementScore({ likes: 10 })).toBe(10);
    expect(engagementScore({ comments: 10 })).toBe(20);
    expect(engagementScore({ shares: 10 })).toBe(30);
    expect(engagementScore({ impressions: 1000 })).toBe(1);
  });

  it("treats missing metrics as zero", () => {
    expect(engagementScore({})).toBe(0);
  });
});

describe("summarizePerformance", () => {
  it("returns null when there is nothing measured", () => {
    expect(summarizePerformance([])).toBeNull();
  });

  it("ranks by engagement and surfaces top pillars, formats, highlights", () => {
    const records = [
      rec({ pillar: "education", format: "text", idea: "weak", metrics: { likes: 1 } }),
      rec({ pillar: "story", format: "image", idea: "strong", metrics: { shares: 50 } }),
      rec({ pillar: "story", format: "carousel", idea: "mid", metrics: { comments: 5 } }),
    ];
    const brief = summarizePerformance(records)!;

    expect(brief.sampleSize).toBe(3);
    // "story/image" (150) ranks above "story/carousel" (10) above "education/text" (1).
    expect(brief.topPillars[0]).toBe("story");
    expect(brief.topFormats[0]).toBe("image");
    expect(brief.highlights[0]).toMatchObject({ idea: "strong", platform: "linkedin" });
    expect(brief.highlights[0]!.score).toBe(150);
  });

  it("de-duplicates pillars/formats and caps the list", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      rec({ pillar: "same", format: "text", idea: `idea-${i}`, metrics: { likes: i } }),
    );
    const brief = summarizePerformance(records)!;
    expect(brief.topPillars).toEqual(["same"]);
    expect(brief.highlights.length).toBeLessThanOrEqual(5);
  });

  it("omits highlights for records without an idea", () => {
    const brief = summarizePerformance([rec({ metrics: { likes: 99 } })])!;
    expect(brief.highlights).toEqual([]);
  });
});
