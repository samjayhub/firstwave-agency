import { describe, expect, it, vi } from "vitest";
import { parseTiktokHashtags, tiktokCreativeCenterSource } from "./tiktok-creative-center";

const RESPONSE = {
  data: {
    list: [
      { hashtag_name: "marketingtips", video_views: 9000000, rank: 1 },
      { hashtag_name: "#dance", video_views: 5000000, rank: 2 },
      { hashtag_name: "marketinghacks", publish_cnt: 1200, rank: 3 },
    ],
  },
};

function fakeFetch(json: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => json })) as unknown as typeof fetch;
}

describe("parseTiktokHashtags", () => {
  it("normalizes hashtags and ranks by position", () => {
    const obs = parseTiktokHashtags(RESPONSE);
    expect(obs).toHaveLength(3);
    expect(obs[0]).toMatchObject({ topic: "#marketingtips", volume: 9000000 });
    expect(obs[1]!.topic).toBe("#dance"); // already prefixed, not double-hashed
    expect(obs[0]!.growth).toBeGreaterThan(obs[2]!.growth);
  });

  it("falls back to publish_cnt for volume and tolerates junk", () => {
    expect(parseTiktokHashtags({ data: { list: [{ hashtag_name: "x", publish_cnt: 7 }] } })[0]).toMatchObject({
      volume: 7,
    });
    expect(parseTiktokHashtags({})).toEqual([]);
    expect(parseTiktokHashtags(null)).toEqual([]);
  });
});

describe("tiktokCreativeCenterSource", () => {
  it("filters to niche-matching hashtags", async () => {
    const source = tiktokCreativeCenterSource({ fetchImpl: fakeFetch(RESPONSE) });
    const feed = await source({ niche: "marketing", platform: "tiktok", keywords: [] });
    expect(feed.observations.map((o) => o.topic)).toEqual(["#marketingtips", "#marketinghacks"]);
  });

  it("throws on a non-OK response", async () => {
    const source = tiktokCreativeCenterSource({ fetchImpl: fakeFetch({}, false, 503) });
    await expect(
      source({ niche: "x", platform: "tiktok", keywords: [] }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
