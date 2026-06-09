import { describe, it, expect } from "vitest";
import { YouTubePublisher } from "./youtube";

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
  return new YouTubePublisher({
    clientId: "cid",
    clientSecret: "csecret",
    fetchFn: fakeFetch(routes),
    now: () => 1_000_000,
  });
}

describe("YouTubePublisher.authorizeUrl", () => {
  it("requests upload scope and offline access", () => {
    const url = pub([]).authorizeUrl({ redirectUri: "https://app/cb", state: "xyz" });
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=xyz");
    expect(url).toContain("youtube.upload");
    expect(url).toContain("access_type=offline");
  });
});

describe("YouTubePublisher.exchangeCode", () => {
  it("exchanges a code and resolves the channel", async () => {
    const conn = await pub([
      ["oauth2.googleapis.com/token", () =>
        json({ access_token: "tok", refresh_token: "rtok", expires_in: 3600 })],
      ["channels?part", () => json({ items: [{ id: "UC123", snippet: { title: "My Channel" } }] })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("UC123");
    expect(conn.handle).toBe("My Channel");
    expect(conn.accessToken).toBe("tok");
    expect(conn.refreshToken).toBe("rtok");
    expect(conn.expiresAt?.getTime()).toBe(1_000_000 + 3600 * 1000);
  });

  it("maps a failed token exchange to ExternalServiceError", async () => {
    await expect(
      pub([["oauth2.googleapis.com/token", () => new Response("no", { status: 400 })]]).exchangeCode(
        "bad",
        "https://app/cb",
      ),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("fails when the account has no channel", async () => {
    await expect(
      pub([
        ["oauth2.googleapis.com/token", () => json({ access_token: "tok" })],
        ["channels?part", () => json({ items: [] })],
      ]).exchangeCode("code", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("YouTubePublisher.publish", () => {
  it("runs the resumable upload flow and returns the video id + permalink", async () => {
    const result = await pub([
      ["cdn/video.mp4", () =>
        new Response("BINARY", { status: 200, headers: { "content-type": "video/mp4" } })],
      ["uploadType=resumable", () =>
        new Response("{}", { status: 200, headers: { location: "https://upload/session/abc" } })],
      ["upload/session/abc", () => json({ id: "vid123" })],
    ]).publish({
      accessToken: "tok",
      authorId: "UC123",
      caption: "My title\nfull description",
      mediaUrls: ["https://cdn/video.mp4"],
    });
    expect(result.externalId).toBe("vid123");
    expect(result.permalink).toBe("https://www.youtube.com/watch?v=vid123");
  });

  it("rejects a publish with no video", async () => {
    await expect(
      pub([]).publish({ accessToken: "tok", authorId: "UC123", caption: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("fails when the upload session has no location header", async () => {
    await expect(
      pub([
        ["cdn/video.mp4", () => new Response("BIN", { status: 200 })],
        ["uploadType=resumable", () => new Response("{}", { status: 200 })],
      ]).publish({
        accessToken: "tok",
        authorId: "UC123",
        caption: "t",
        mediaUrls: ["https://cdn/video.mp4"],
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("YouTubePublisher.fetchMetrics", () => {
  it("maps video statistics into a snapshot", async () => {
    const snap = await pub([
      ["videos?part=statistics", () =>
        json({ items: [{ statistics: { viewCount: "5000", likeCount: "120", commentCount: "8" } }] })],
    ]).fetchMetrics({ accessToken: "tok", externalId: "vid123" });
    expect(snap.impressions).toBe(5000);
    expect(snap.likes).toBe(120);
    expect(snap.comments).toBe(8);
    expect(snap.capturedAt.getTime()).toBe(1_000_000);
  });
});
