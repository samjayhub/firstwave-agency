import { describe, it, expect } from "vitest";
import { XPublisher } from "./x";

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
  return new XPublisher({
    clientId: "cid",
    clientSecret: "csecret",
    fetchFn: fakeFetch(routes),
    now: () => 1_000_000,
  });
}

describe("XPublisher.authorizeUrl", () => {
  it("requests tweet.write scope with PKCE challenge + state", () => {
    const url = pub([]).authorizeUrl({ redirectUri: "https://app/cb", state: "xyz" });
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=xyz");
    expect(url).toContain("tweet.write");
    expect(url).toContain("code_challenge=");
    expect(url).toContain("code_challenge_method=plain");
  });
});

describe("XPublisher.exchangeCode", () => {
  it("exchanges a code (Basic auth) and resolves user id + username", async () => {
    const conn = await pub([
      ["oauth2/token", () =>
        json({ access_token: "tok", refresh_token: "rtok", expires_in: 7200 })],
      ["users/me", () => json({ data: { id: "u1", username: "acme" } })],
    ]).exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("u1");
    expect(conn.handle).toBe("acme");
    expect(conn.accessToken).toBe("tok");
    expect(conn.refreshToken).toBe("rtok");
    expect(conn.expiresAt?.getTime()).toBe(1_000_000 + 7200 * 1000);
  });

  it("fails when the token exchange returns no access token", async () => {
    await expect(
      pub([["oauth2/token", () => json({})]]).exchangeCode("c", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("fails when the profile lookup has no user id", async () => {
    await expect(
      pub([
        ["oauth2/token", () => json({ access_token: "tok" })],
        ["users/me", () => json({ data: {} })],
      ]).exchangeCode("c", "https://app/cb"),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("XPublisher.publish", () => {
  it("posts a tweet and returns the id + permalink", async () => {
    const result = await pub([
      ["2/tweets", () => json({ data: { id: "t_123", text: "hi" } })],
    ]).publish({ accessToken: "tok", authorId: "u1", caption: "hi" });
    expect(result.externalId).toBe("t_123");
    expect(result.permalink).toContain("t_123");
  });

  it("truncates a caption beyond 280 chars", async () => {
    let sentText = "";
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      sentText = JSON.parse(String(init?.body)).text;
      return json({ data: { id: "t_1" } });
    }) as unknown as typeof fetch;
    const p = new XPublisher({ clientId: "cid", clientSecret: "csecret", fetchFn });
    await p.publish({ accessToken: "tok", authorId: "u1", caption: "a".repeat(400) });
    expect(sentText.length).toBe(280);
  });

  it("rejects media posts (not supported yet)", async () => {
    await expect(
      pub([]).publish({
        accessToken: "tok",
        authorId: "u1",
        caption: "x",
        mediaUrls: ["https://cdn/v.mp4"],
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("maps a non-2xx publish to ExternalServiceError", async () => {
    await expect(
      pub([["2/tweets", () => new Response("nope", { status: 403 })]]).publish({
        accessToken: "tok",
        authorId: "u1",
        caption: "x",
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("XPublisher.fetchMetrics", () => {
  it("maps public_metrics into a snapshot (retweets+quotes = shares)", async () => {
    const snap = await pub([
      ["2/tweets/", () =>
        json({
          data: {
            public_metrics: {
              impression_count: 5000,
              like_count: 120,
              reply_count: 8,
              retweet_count: 30,
              quote_count: 5,
            },
          },
        })],
    ]).fetchMetrics({ accessToken: "tok", externalId: "t_1" });
    expect(snap.impressions).toBe(5000);
    expect(snap.likes).toBe(120);
    expect(snap.comments).toBe(8);
    expect(snap.shares).toBe(35);
    expect(snap.capturedAt.getTime()).toBe(1_000_000);
  });

  it("fails when the tweet has no metrics", async () => {
    await expect(
      pub([["2/tweets/", () => json({ data: {} })]]).fetchMetrics({
        accessToken: "tok",
        externalId: "t_1",
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
