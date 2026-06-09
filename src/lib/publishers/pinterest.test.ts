import { describe, it, expect } from "vitest";
import { PinterestPublisher } from "./pinterest";

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
  return new PinterestPublisher({
    appId: "app",
    appSecret: "secret",
    fetchFn: fakeFetch(routes),
    now: () => 1_700_000_000_000,
  });
}

describe("PinterestPublisher.authorizeUrl", () => {
  it("requests pins:write scope with client_id + state", () => {
    const url = pub([]).authorizeUrl({ redirectUri: "https://app/cb", state: "xyz" });
    expect(url).toContain("client_id=app");
    expect(url).toContain("state=xyz");
    expect(url).toContain("pins%3Awrite");
  });
});

describe("PinterestPublisher.exchangeCode", () => {
  it("exchanges a code (Basic auth) and resolves the username", async () => {
    const conn = await pub([
      ["oauth/token", () =>
        json({ access_token: "tok", refresh_token: "rtok", expires_in: 3600 })],
      ["user_account", () => json({ username: "acme" })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("acme");
    expect(conn.handle).toBe("acme");
    expect(conn.accessToken).toBe("tok");
    expect(conn.refreshToken).toBe("rtok");
    expect(conn.expiresAt?.getTime()).toBe(1_700_000_000_000 + 3600 * 1000);
  });

  it("fails when no access token is returned", async () => {
    await expect(
      pub([["oauth/token", () => json({})]]).exchangeCode("c", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("fails when the profile has no username", async () => {
    await expect(
      pub([
        ["oauth/token", () => json({ access_token: "tok" })],
        ["user_account", () => json({})],
      ]).exchangeCode("c", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("PinterestPublisher.publish", () => {
  it("pins an image to the account's first board", async () => {
    const result = await pub([
      ["v5/boards", () => json({ items: [{ id: "board_1" }] })],
      ["v5/pins", () => json({ id: "pin_9" })],
    ]).publish({
      accessToken: "tok",
      authorId: "acme",
      caption: "look at this",
      mediaUrls: ["https://cdn/i.png"],
    });
    expect(result.externalId).toBe("pin_9");
    expect(result.permalink).toContain("pin_9");
  });

  it("rejects a pin with no image", async () => {
    await expect(
      pub([]).publish({ accessToken: "tok", authorId: "acme", caption: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("fails when the account has no board", async () => {
    await expect(
      pub([["v5/boards", () => json({ items: [] })]]).publish({
        accessToken: "tok",
        authorId: "acme",
        caption: "x",
        mediaUrls: ["https://cdn/i.png"],
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("PinterestPublisher.fetchMetrics", () => {
  it("maps pin analytics into a snapshot (SAVE→shares, PIN_CLICK→likes)", async () => {
    const snap = await pub([
      ["/analytics", () =>
        json({ all: { summary_metrics: { IMPRESSION: 4000, SAVE: 120, PIN_CLICK: 60 } } })],
    ]).fetchMetrics({ accessToken: "tok", externalId: "pin_9" });
    expect(snap.impressions).toBe(4000);
    expect(snap.shares).toBe(120);
    expect(snap.likes).toBe(60);
    expect(snap.capturedAt.getTime()).toBe(1_700_000_000_000);
  });

  it("tolerates top-level summary_metrics", async () => {
    const snap = await pub([
      ["/analytics", () => json({ summary_metrics: { IMPRESSION: 10 } })],
    ]).fetchMetrics({ accessToken: "tok", externalId: "pin_9" });
    expect(snap.impressions).toBe(10);
    expect(snap.shares).toBe(0);
  });

  it("fails when no metrics are returned", async () => {
    await expect(
      pub([["/analytics", () => json({})]]).fetchMetrics({
        accessToken: "tok",
        externalId: "pin_9",
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
