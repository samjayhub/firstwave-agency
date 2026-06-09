import { describe, expect, it } from "vitest";
import { combineSources, mergeObservations } from "./combine";
import type { TrendFeed, TrendSource } from "./types";

const src =
  (feed: Partial<TrendFeed> & { observations: TrendFeed["observations"] }): TrendSource =>
  async ({ platform }) => ({ platform, ...feed });

const failing: TrendSource = async () => {
  throw new Error("source down");
};

describe("mergeObservations", () => {
  it("dedupes by topic keeping the strongest signal and union of refs", () => {
    const merged = mergeObservations([
      { topic: "AI", volume: 100, growth: 0.2, sampleRefs: ["a"] },
      { topic: "ai", volume: 300, growth: 0.1, sampleRefs: ["b"] },
      { topic: "VR", volume: 50, growth: 0.5 },
    ]);
    expect(merged).toHaveLength(2);
    const ai = merged.find((o) => o.topic.toLowerCase() === "ai")!;
    expect(ai.volume).toBe(300);
    expect(ai.growth).toBe(0.2);
    expect(ai.sampleRefs).toEqual(["a", "b"]);
  });
});

describe("combineSources", () => {
  it("merges observations from every source", async () => {
    const combined = combineSources(
      src({ observations: [{ topic: "A", volume: 10, growth: 0.1 }] }),
      src({ observations: [{ topic: "B", volume: 20, growth: 0.2 }] }),
    );
    const feed = await combined({ niche: "n", platform: "youtube", keywords: [] });
    expect(feed.observations.map((o) => o.topic).sort()).toEqual(["A", "B"]);
  });

  it("tolerates a failing source as long as one succeeds", async () => {
    const combined = combineSources(failing, src({ observations: [{ topic: "A", volume: 1, growth: 0 }] }));
    const feed = await combined({ niche: "n", platform: "youtube", keywords: [] });
    expect(feed.observations).toHaveLength(1);
  });

  it("throws only when every source fails", async () => {
    const combined = combineSources(failing, failing);
    await expect(
      combined({ niche: "n", platform: "youtube", keywords: [] }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("requires at least one source", () => {
    expect(() => combineSources()).toThrow();
  });
});
