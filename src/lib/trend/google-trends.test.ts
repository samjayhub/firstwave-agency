import { describe, it, expect } from "vitest";
import {
  googleTrendsSource,
  parseApproxTraffic,
  parseDailyTrendsRss,
} from "./google-trends";

const RSS = `<?xml version="1.0"?><rss><channel>
  <item>
    <title>AI fitness app</title>
    <ht:approx_traffic>50,000+</ht:approx_traffic>
    <ht:news_item><ht:news_item_url>https://news/1</ht:news_item_url></ht:news_item>
  </item>
  <item>
    <title><![CDATA[Stock market today]]></title>
    <ht:approx_traffic>20,000+</ht:approx_traffic>
  </item>
</channel></rss>`;

function fakeFetch(body: string, status = 200): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("parseApproxTraffic", () => {
  it("strips formatting to a number", () => {
    expect(parseApproxTraffic("50,000+")).toBe(50000);
    expect(parseApproxTraffic("1,200")).toBe(1200);
    expect(parseApproxTraffic(undefined)).toBe(0);
    expect(parseApproxTraffic("n/a")).toBe(0);
  });
});

describe("parseDailyTrendsRss", () => {
  it("extracts topics, volume, refs and a position-based growth proxy", () => {
    const obs = parseDailyTrendsRss(RSS);
    expect(obs).toHaveLength(2);
    expect(obs[0]).toMatchObject({
      topic: "AI fitness app",
      volume: 50000,
      growth: 1, // top item = strongest rising signal
      sampleRefs: ["https://news/1"],
    });
    expect(obs[1]!.topic).toBe("Stock market today"); // CDATA decoded
    expect(obs[1]!.growth).toBe(0); // last of two items
  });
});

describe("googleTrendsSource", () => {
  it("keeps observations overlapping the niche/keywords", async () => {
    const source = googleTrendsSource({ fetchImpl: fakeFetch(RSS) });
    const feed = await source({ niche: "fitness", platform: "youtube", keywords: [] });
    expect(feed.platform).toBe("youtube");
    expect(feed.observations.map((o) => o.topic)).toEqual(["AI fitness app"]);
  });

  it("falls back to the full feed when nothing matches", async () => {
    const source = googleTrendsSource({ fetchImpl: fakeFetch(RSS) });
    const feed = await source({ niche: "underwater basket weaving", platform: "youtube", keywords: [] });
    expect(feed.observations).toHaveLength(2);
  });

  it("maps a non-200 response to ExternalServiceError", async () => {
    const source = googleTrendsSource({ fetchImpl: fakeFetch("nope", 500) });
    await expect(
      source({ niche: "fitness", platform: "youtube", keywords: [] }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
