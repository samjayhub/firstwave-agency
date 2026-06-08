import { describe, it, expect } from "vitest";
import { TikTokPublisher } from "./tiktok";

function fakeFetch(routes: Array<[string, () => Response]>): typeof fetch {
  return (async (url: string | URL) => {
    const u = typeof url === "string" ? url : url.toString();
    for (const [frag, make] of routes) {
      if (u.includes(frag)) return make();
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function pub(routes: Array<[string, () => Response]>) {
  return new TikTokPublisher({
    clientKey: "ckey",
    clientSecret: "csecret",
    fetchFn: fakeFetch(routes),
    now: () => 1_000_000,
  });
}

describe("TikTokPublisher.authorizeUrl", () => {
  it("requests the video.publish scope with client_key + state", () => {
    const url = pub([]).authorizeUrl({ redirectUri: "https://app/cb", state: "xyz" });
    expect(url).toContain("client_key=ckey");
    expect(url).toContain("state=xyz");
    expect(url).toContain("video.publish");
  });
});

describe("TikTokPublisher.exchangeCode", () => {
  it("exchanges a code and resolves open_id + display name", async () => {
    const conn = await pub([
      ["oauth/token", () =>
        json({ access_token: "tok", refresh_token: "rtok", expires_in: 3600, open_id: "open1" })],
      ["user/info", () => json({ data: { user: { display_name: "Acme" } } })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("open1");
    expect(conn.handle).toBe("Acme");
    expect(conn.accessToken).toBe("tok");
    expect(conn.refreshToken).toBe("rtok");
    expect(conn.expiresAt?.getTime()).toBe(1_000_000 + 3600 * 1000);
  });

  it("still connects when the user-info lookup fails", async () => {
    const conn = await pub([
      ["oauth/token", () => json({ access_token: "tok", open_id: "open1" })],
      ["user/info", () => new Response("nope", { status: 500 })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("open1");
    expect(conn.handle).toBeUndefined();
  });

  it("fails when no open_id is returned", async () => {
    await expect(
      pub([["oauth/token", () => json({ access_token: "tok" })]]).exchangeCode("c", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("TikTokPublisher.publish", () => {
  it("inits a PULL_FROM_URL direct post and returns the publish id", async () => {
    const result = await pub([
      ["post/publish/video/init", () =>
        json({ data: { publish_id: "pub_123" }, error: { code: "ok" } })],
    ]).publish({
      accessToken: "tok",
      authorId: "open1",
      caption: "my clip",
      mediaUrls: ["https://cdn/v.mp4"],
    });
    expect(result.externalId).toBe("pub_123");
    expect(result.permalink).toBeUndefined();
  });

  it("rejects a publish with no video", async () => {
    await expect(
      pub([]).publish({ accessToken: "tok", authorId: "open1", caption: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("maps a non-ok envelope error to ExternalServiceError", async () => {
    await expect(
      pub([
        ["post/publish/video/init", () =>
          json({ error: { code: "rate_limit_exceeded", message: "slow down" } })],
      ]).publish({
        accessToken: "tok",
        authorId: "open1",
        caption: "x",
        mediaUrls: ["https://cdn/v.mp4"],
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("TikTokPublisher.fetchMetrics", () => {
  it("queries the video and maps counts into a snapshot", async () => {
    const snap = await pub([
      ["video/query", () =>
        json({
          data: {
            videos: [{ view_count: 9000, like_count: 300, comment_count: 12, share_count: 40 }],
          },
          error: { code: "ok" },
        })],
    ]).fetchMetrics({ accessToken: "tok", externalId: "vid1" });
    expect(snap.impressions).toBe(9000);
    expect(snap.likes).toBe(300);
    expect(snap.comments).toBe(12);
    expect(snap.shares).toBe(40);
    expect(snap.capturedAt.getTime()).toBe(1_000_000);
  });
});
