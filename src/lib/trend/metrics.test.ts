import { describe, it, expect } from "vitest";
import { rankTrends } from "./metrics";
import type { TrendFeed } from "./types";

const FEED: TrendFeed = {
  platform: "youtube",
  observations: [
    { topic: "A", volume: 1000, growth: 0.5 },
    { topic: "B", volume: 500, growth: 2.0 },
    { topic: "C", volume: 200, growth: -0.5, sampleRefs: ["https://x/1"] },
  ],
};

describe("rankTrends", () => {
  it("scores 60% size / 40% momentum and ranks by score desc", () => {
    const ranked = rankTrends(FEED);
    expect(ranked.map((s) => s.topic)).toEqual(["A", "B", "C"]);
    // A: full volume share (60) + growthFactor 1.5 (20) = 80.
    expect(ranked[0]!.score).toBe(80);
    // B: half volume (30) + growthFactor capped at 3 (40) = 70.
    expect(ranked[1]!.score).toBe(70);
    // C: 0.2 volume (12) + growthFactor 0.5 (6.67) = 18.67.
    expect(ranked[2]!.score).toBe(18.67);
  });

  it("never scores below 0 for a collapsing topic and passes through refs", () => {
    const ranked = rankTrends(FEED);
    const c = ranked.find((s) => s.topic === "C")!;
    expect(c.score).toBeGreaterThanOrEqual(0);
    expect(c.sampleRefs).toEqual(["https://x/1"]);
    expect(c.growth).toBe(-0.5);
  });

  it("handles an all-zero-volume feed without dividing by zero", () => {
    const ranked = rankTrends({
      platform: "youtube",
      observations: [{ topic: "Z", volume: 0, growth: 0 }],
    });
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(0);
    expect(ranked[0]!.sampleRefs).toEqual([]);
  });
});
