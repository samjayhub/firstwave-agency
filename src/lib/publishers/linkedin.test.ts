import { describe, it, expect } from "vitest";
import { LinkedInPublisher } from "./linkedin";

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (url: string | URL) => {
    const u = typeof url === "string" ? url : url.toString();
    for (const [frag, make] of Object.entries(routes)) {
      if (u.includes(frag)) return make();
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

const config = (fetchFn: typeof fetch) => ({
  clientId: "cid",
  clientSecret: "csecret",
  fetchFn,
  now: () => 1_000_000,
});

describe("LinkedInPublisher.authorizeUrl", () => {
  it("builds the OAuth authorize URL with scope and state", () => {
    const pub = new LinkedInPublisher(config(fakeFetch({})));
    const url = pub.authorizeUrl({ redirectUri: "https://app/cb", state: "xyz" });
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=xyz");
    expect(url).toContain("w_member_social");
  });
});

describe("LinkedInPublisher.exchangeCode", () => {
  it("exchanges a code and resolves the member urn", async () => {
    const pub = new LinkedInPublisher(
      config(
        fakeFetch({
          accessToken: () =>
            new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 }),
          userinfo: () => new Response(JSON.stringify({ sub: "abc", name: "Acme" }), { status: 200 }),
        }),
      ),
    );
    const conn = await pub.exchangeCode("code", "https://app/cb");
    expect(conn.externalId).toBe("urn:li:person:abc");
    expect(conn.accessToken).toBe("tok");
    expect(conn.handle).toBe("Acme");
    expect(conn.expiresAt?.getTime()).toBe(1_000_000 + 3600 * 1000);
  });

  it("maps a failed token exchange to ExternalServiceError", async () => {
    const pub = new LinkedInPublisher(
      config(fakeFetch({ accessToken: () => new Response("nope", { status: 400 }) })),
    );
    await expect(pub.exchangeCode("bad", "https://app/cb")).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE",
    });
  });
});

describe("LinkedInPublisher.publish", () => {
  it("posts a UGC share and returns the post id + permalink", async () => {
    const pub = new LinkedInPublisher(
      config(
        fakeFetch({
          ugcPosts: () =>
            new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:99" } }),
        }),
      ),
    );
    const result = await pub.publish({
      accessToken: "tok",
      authorId: "urn:li:person:abc",
      caption: "Hello world",
    });
    expect(result.externalId).toBe("urn:li:share:99");
    expect(result.permalink).toContain("urn:li:share:99");
  });

  it("maps a failed publish to ExternalServiceError (no token leak)", async () => {
    const pub = new LinkedInPublisher(
      config(fakeFetch({ ugcPosts: () => new Response("upstream tok leak", { status: 500 }) })),
    );
    await expect(
      pub.publish({ accessToken: "tok", authorId: "urn:li:person:abc", caption: "x" }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
