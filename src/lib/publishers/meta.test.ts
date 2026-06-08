import { describe, it, expect } from "vitest";
import { MetaPublisher, type MetaPlatform } from "./meta";

// Routes match by URL fragment, first-match-wins — order matters where one
// fragment is a substring of another (e.g. "/media_publish" before "/media").
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

function pub(platform: MetaPlatform, routes: Array<[string, () => Response]>) {
  return new MetaPublisher({
    platform,
    appId: "app",
    appSecret: "secret",
    fetchFn: fakeFetch(routes),
    now: () => 1_000_000,
  });
}

describe("MetaPublisher.authorizeUrl", () => {
  it("uses page-publish scope for Facebook", () => {
    const url = pub("meta_fb", []).authorizeUrl({ redirectUri: "https://app/cb", state: "xyz" });
    expect(url).toContain("client_id=app");
    expect(url).toContain("state=xyz");
    expect(url).toContain("pages_manage_posts");
  });

  it("uses content-publish scope for Instagram", () => {
    const url = pub("meta_ig", []).authorizeUrl({ redirectUri: "https://app/cb", state: "s" });
    expect(url).toContain("instagram_content_publish");
  });
});

describe("MetaPublisher.exchangeCode", () => {
  it("resolves the Page id + page token for Facebook", async () => {
    const conn = await pub("meta_fb", [
      ["oauth/access_token", () => json({ access_token: "user-tok", expires_in: 3600 })],
      ["me/accounts", () => json({ data: [{ id: "page1", name: "Acme Co", access_token: "page-tok" }] })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("page1");
    expect(conn.handle).toBe("Acme Co");
    expect(conn.accessToken).toBe("page-tok");
    expect(conn.expiresAt?.getTime()).toBe(1_000_000 + 3600 * 1000);
  });

  it("resolves the linked IG business account for Instagram", async () => {
    const conn = await pub("meta_ig", [
      ["oauth/access_token", () => json({ access_token: "user-tok" })],
      ["me/accounts", () => json({ data: [{ id: "page1", name: "Acme", access_token: "page-tok" }] })],
      ["instagram_business_account", () => json({ instagram_business_account: { id: "ig1", username: "acme" } })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("ig1");
    expect(conn.handle).toBe("acme");
    expect(conn.accessToken).toBe("page-tok");
  });

  it("fails when no Page is available", async () => {
    await expect(
      pub("meta_fb", [
        ["oauth/access_token", () => json({ access_token: "user-tok" })],
        ["me/accounts", () => json({ data: [] })],
      ]).exchangeCode("code", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("fails when IG has no linked business account", async () => {
    await expect(
      pub("meta_ig", [
        ["oauth/access_token", () => json({ access_token: "user-tok" })],
        ["me/accounts", () => json({ data: [{ id: "page1", access_token: "page-tok" }] })],
        ["instagram_business_account", () => json({})],
      ]).exchangeCode("code", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("MetaPublisher.publish", () => {
  it("posts a Facebook text update to /feed", async () => {
    const result = await pub("meta_fb", [
      ["/feed", () => json({ id: "page1_99" })],
    ]).publish({ accessToken: "page-tok", authorId: "page1", caption: "Hello" });
    expect(result.externalId).toBe("page1_99");
    expect(result.permalink).toContain("page1_99");
  });

  it("posts a Facebook photo when media is provided", async () => {
    const result = await pub("meta_fb", [
      ["/photos", () => json({ id: "photo1", post_id: "page1_77" })],
    ]).publish({
      accessToken: "page-tok",
      authorId: "page1",
      caption: "Look",
      mediaUrls: ["https://cdn/x.jpg"],
    });
    expect(result.externalId).toBe("page1_77");
  });

  it("creates then publishes an Instagram container", async () => {
    const result = await pub("meta_ig", [
      ["/media_publish", () => json({ id: "ig_media_1" })],
      ["/media", () => json({ id: "container1" })],
    ]).publish({
      accessToken: "page-tok",
      authorId: "ig1",
      caption: "Hi",
      mediaUrls: ["https://cdn/x.jpg"],
    });
    expect(result.externalId).toBe("ig_media_1");
    expect(result.permalink).toContain("instagram.com");
  });

  it("rejects an Instagram post with no media", async () => {
    await expect(
      pub("meta_ig", []).publish({ accessToken: "t", authorId: "ig1", caption: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("maps an upstream publish failure to ExternalServiceError", async () => {
    await expect(
      pub("meta_fb", [["/feed", () => new Response("token leak xyz", { status: 500 })]]).publish({
        accessToken: "page-tok",
        authorId: "page1",
        caption: "x",
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("MetaPublisher.fetchMetrics", () => {
  it("maps Instagram insights into a snapshot", async () => {
    const snap = await pub("meta_ig", [
      [
        "/insights",
        () =>
          json({
            data: [
              { name: "impressions", values: [{ value: 1000 }] },
              { name: "likes", values: [{ value: 50 }] },
              { name: "comments", values: [{ value: 4 }] },
            ],
          }),
      ],
    ]).fetchMetrics({ accessToken: "page-tok", externalId: "ig_media_1" });
    expect(snap.impressions).toBe(1000);
    expect(snap.likes).toBe(50);
    expect(snap.comments).toBe(4);
    expect(snap.capturedAt.getTime()).toBe(1_000_000);
  });
});
