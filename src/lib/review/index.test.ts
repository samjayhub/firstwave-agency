import { describe, expect, it, beforeEach } from "vitest";
import { ReviewService } from "./index";
import { FakeReviewStore } from "./fakes";
import { FakeBrandingStore } from "@/lib/repositories/fakes/fake-branding-store";

const CTX = { agencyId: "ag1" };

function setup() {
  const store = new FakeReviewStore(
    [{ clientId: "c1", agencyId: "ag1", clientName: "Acme" }],
    [
      { id: "it1", clientId: "c1", status: "in_review", scheduledAt: null, copy: { brief: { idea: "Teaser" } } },
      { id: "it2", clientId: "c1", status: "draft", scheduledAt: null, copy: {} },
    ],
  );
  const branding = new FakeBrandingStore();
  let n = 0;
  const service = new ReviewService({
    store,
    branding,
    generateToken: () => `tok-${++n}`,
    baseUrl: "https://app.example.com/",
  });
  return { store, branding, service };
}

describe("ReviewService — admin link management", () => {
  it("mints a share link with a full URL for an owned client", async () => {
    const { service } = setup();
    const { share, url } = await service.createLink(CTX, "c1");
    expect(share.token).toBe("tok-1");
    expect(url).toBe("https://app.example.com/review/tok-1");
  });

  it("refuses to mint for a client in another agency", async () => {
    const { service } = setup();
    await expect(service.createLink({ agencyId: "intruder" }, "c1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("revokes a link so its token stops resolving", async () => {
    const { service, store } = setup();
    const { share } = await service.createLink(CTX, "c1");
    await service.revokeLink(CTX, share.id);
    expect(store.shares[0]!.revoked).toBe(true);
    await expect(service.portal(share.token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ReviewService — reviewer portal", () => {
  let token: string;
  let svc: ReviewService;
  let store: FakeReviewStore;

  beforeEach(async () => {
    const s = setup();
    svc = s.service;
    store = s.store;
    s.branding.upsertByAgency("ag1", { brandName: "Acme Studio", primaryColor: "#ff0000" });
    token = (await svc.createLink(CTX, "c1")).share.token;
  });

  it("returns only in-review items, branded", async () => {
    const portal = await svc.portal(token);
    expect(portal.clientName).toBe("Acme");
    expect(portal.branding.brandName).toBe("Acme Studio");
    expect(portal.items.map((i) => i.id)).toEqual(["it1"]); // it2 is draft
  });

  it("rejects an invalid token", async () => {
    await expect(svc.portal("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("approve flips in_review → approved", async () => {
    const res = await svc.decide(token, "it1", "approve");
    expect(res.status).toBe("approved");
    expect(store.items.find((i) => i.id === "it1")!.status).toBe("approved");
  });

  it("request_changes flips to draft and records the note", async () => {
    const res = await svc.decide(token, "it1", "request_changes", "Tighten the hook");
    expect(res.status).toBe("draft");
    expect(res.comment?.body).toBe("Tighten the hook");
    expect(store.items.find((i) => i.id === "it1")!.status).toBe("draft");
  });

  it("requires a note when requesting changes", async () => {
    await expect(svc.decide(token, "it1", "request_changes")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses to act on an item that is not in review", async () => {
    await expect(svc.decide(token, "it2", "approve")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("404s for an item on a different client", async () => {
    await expect(svc.decide(token, "ghost", "approve")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
