import { describe, expect, it, vi } from "vitest";
import { parseYoutubeTrending, youtubeTrendingSource } from "./youtube-trending";

const RESPONSE = {
  items: [
    { id: "v1", snippet: { title: "Marketing tips that work" }, statistics: { viewCount: "1000000" } },
    { id: "v2", snippet: { title: "Cooking at home" }, statistics: { viewCount: "500000" } },
    { id: "v3", snippet: { title: "Marketing automation deep dive" }, statistics: { viewCount: "200000" } },
  ],
};

function fakeFetch(json: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => json })) as unknown as typeof fetch;
}

describe("parseYoutubeTrending", () => {
  it("maps videos to observations with position-based growth", () => {
    const obs = parseYoutubeTrending(RESPONSE);
    expect(obs).toHaveLength(3);
    expect(obs[0]).toMatchObject({ topic: "Marketing tips that work", volume: 1000000 });
    expect(obs[0]!.growth).toBeGreaterThan(obs[2]!.growth); // top of chart = stronger
    expect(obs[0]!.sampleRefs).toEqual(["https://www.youtube.com/watch?v=v1"]);
  });

  it("tolerates a malformed payload", () => {
    expect(parseYoutubeTrending({})).toEqual([]);
    expect(parseYoutubeTrending(null)).toEqual([]);
    expect(parseYoutubeTrending({ items: [{ statistics: {} }] })).toEqual([]); // no title
  });
});

describe("youtubeTrendingSource", () => {
  it("filters to niche-matching titles, tagging the requested platform", async () => {
    const source = youtubeTrendingSource({ apiKey: "k", fetchImpl: fakeFetch(RESPONSE) });
    const feed = await source({ niche: "marketing", platform: "youtube", keywords: [] });
    expect(feed.platform).toBe("youtube");
    expect(feed.observations.map((o) => o.topic)).toEqual([
      "Marketing tips that work",
      "Marketing automation deep dive",
    ]);
  });

  it("falls back to the full chart when nothing matches", async () => {
    const source = youtubeTrendingSource({ apiKey: "k", fetchImpl: fakeFetch(RESPONSE) });
    const feed = await source({ niche: "astrophysics", platform: "youtube", keywords: [] });
    expect(feed.observations).toHaveLength(3);
  });

  it("throws on a non-OK response", async () => {
    const source = youtubeTrendingSource({ apiKey: "k", fetchImpl: fakeFetch({}, false, 403) });
    await expect(
      source({ niche: "x", platform: "youtube", keywords: [] }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
