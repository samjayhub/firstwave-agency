import { describe, expect, it, vi } from "vitest";
import { WebhookService, signPayload } from "./index";
import { FakeWebhookStore } from "./fakes";

const CTX = { agencyId: "ag1" };
const NOW = new Date("2026-06-09T00:00:00Z");

function setup(fetchImpl?: typeof fetch) {
  const store = new FakeWebhookStore();
  let n = 0;
  const service = new WebhookService({
    store,
    fetchImpl: fetchImpl ?? ((async () => ({ ok: true, status: 200 })) as unknown as typeof fetch),
    randomHex: () => `r${++n}`,
    clock: () => NOW,
  });
  return { store, service };
}

describe("WebhookService management", () => {
  it("creates a webhook with a one-time secret and lists without it", async () => {
    const { service } = setup();
    const created = await service.create(CTX, {
      url: "https://x/hook",
      events: ["publish.succeeded"],
    });
    expect(created.secret.startsWith("whsec_")).toBe(true);
    const list = await service.list(CTX);
    expect(list[0]).not.toHaveProperty("secret");
    expect(list[0]).not.toHaveProperty("agencyId");
  });

  it("deletes tenant-scoped, 404 for the wrong agency", async () => {
    const { service } = setup();
    const created = await service.create(CTX, { url: "https://x", events: ["publish.failed"] });
    await expect(service.remove({ agencyId: "other" }, created.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.remove(CTX, created.id)).resolves.toBeUndefined();
  });
});

describe("WebhookService.dispatch", () => {
  it("signs and posts to every subscribed endpoint", async () => {
    const calls: Array<{ url: string; headers: Headers; body: string }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: new Headers(init.headers), body: init.body as string });
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const { service, store } = setup(fetchImpl);
    await service.create(CTX, { url: "https://a/hook", events: ["publish.succeeded"] });
    await service.create(CTX, { url: "https://b/hook", events: ["metric.snapshot"] }); // not subscribed

    const res = await service.dispatch("ag1", "publish.succeeded", { itemId: "it1" });
    expect(res.delivered).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://a/hook");

    // The signature header matches an HMAC of the exact body with the stored secret.
    const secret = store.secrets.get(store.rows[0]!.id)!;
    expect(calls[0]!.headers.get("x-firstwave-signature")).toBe(
      signPayload(secret, calls[0]!.body),
    );
  });

  it("is a no-op when nothing is subscribed", async () => {
    const { service } = setup();
    const res = await service.dispatch("ag1", "publish.failed", {});
    expect(res.delivered).toBe(0);
  });

  it("tolerates an endpoint that fails", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const { service } = setup(fetchImpl);
    await service.create(CTX, { url: "https://a", events: ["publish.succeeded"] });
    const res = await service.dispatch("ag1", "publish.succeeded", {});
    expect(res.delivered).toBe(0); // failed, but no throw
  });
});
