import { describe, it, expect, beforeEach } from "vitest";
import { MediaLibraryService } from "./index";
import { FakeMediaStore } from "./fakes";

const CTX = { agencyId: "ag1" };

function setup() {
  const store = new FakeMediaStore();
  // Two items for the same client, plus one for another client.
  store.seedItem({ itemId: "it1", agencyId: "ag1", clientId: "cl1", status: "draft" });
  store.seedItem({ itemId: "it2", agencyId: "ag1", clientId: "cl1", status: "draft" });
  store.seedItem({ itemId: "it_other", agencyId: "ag1", clientId: "cl2", status: "draft" });
  const svc = new MediaLibraryService({ store });
  return { store, svc };
}

describe("MediaLibraryService — browse", () => {
  it("lists a client's assets newest-first, excluding archived by default", async () => {
    const { store, svc } = setup();
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", createdAt: new Date(1) });
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it2", createdAt: new Date(2) });
    store.seedAsset({
      agencyId: "ag1",
      clientId: "cl1",
      contentItemId: "it1",
      createdAt: new Date(3),
      archivedAt: new Date(9),
    });
    const live = await svc.list(CTX, "cl1");
    expect(live.map((a) => a.contentItemId)).toEqual(["it2", "it1"]); // newest first, archived hidden
    const all = await svc.list(CTX, "cl1", { includeArchived: true });
    expect(all).toHaveLength(3);
  });

  it("filters by kind", async () => {
    const { store, svc } = setup();
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", kind: "image" });
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", kind: "video" });
    const vids = await svc.list(CTX, "cl1", { kind: "video" });
    expect(vids).toHaveLength(1);
    expect(vids[0]!.kind).toBe("video");
  });

  it("does not leak another agency's assets", async () => {
    const { store, svc } = setup();
    store.seedAsset({ agencyId: "other", clientId: "cl1", contentItemId: "it1" });
    expect(await svc.list(CTX, "cl1")).toHaveLength(0);
  });
});

describe("MediaLibraryService — reattach (reuse)", () => {
  let store: FakeMediaStore;
  let svc: MediaLibraryService;
  beforeEach(() => {
    ({ store, svc } = setup());
  });

  it("re-attaches a past asset to another item over the same stored object, no regeneration", async () => {
    const src = store.seedAsset({
      agencyId: "ag1",
      clientId: "cl1",
      contentItemId: "it1",
      url: "memory://cl1/orig.png",
      contentHash: "h1",
    });
    const reused = await svc.reattach(CTX, src.id, "it2");
    expect(reused.url).toBe("memory://cl1/orig.png"); // same bytes, not regenerated
    expect(reused.source).toBe("reused");
    expect(reused.contentItemId).toBe("it2");
    expect(reused.version).toBe(2);
    // Source got anchored into the group; both share it.
    expect(store.assets.find((a) => a.id === src.id)!.groupId).toBe(src.id);
    expect(reused.groupId).toBe(src.id);
  });

  it("increments the version on each reuse", async () => {
    const src = store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1" });
    const v2 = await svc.reattach(CTX, src.id, "it2");
    const v3 = await svc.reattach(CTX, src.id, "it1");
    expect([v2.version, v3.version]).toEqual([2, 3]);
  });

  it("refuses to reuse across clients", async () => {
    const src = store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1" });
    await expect(svc.reattach(CTX, src.id, "it_other")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("404s for an unknown asset or target item", async () => {
    const src = store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1" });
    await expect(svc.reattach(CTX, "missing", "it2")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.reattach(CTX, src.id, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("MediaLibraryService — versions", () => {
  it("returns the group oldest-first; a standalone asset returns just itself", async () => {
    const { store, svc } = setup();
    const a = store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1" });
    expect(await svc.versions(CTX, a.id)).toHaveLength(1);
    const reused = await svc.reattach(CTX, a.id, "it2");
    const group = await svc.versions(CTX, reused.id);
    expect(group.map((g) => g.version)).toEqual([1, 2]);
  });
});

describe("MediaLibraryService — lifecycle + retention", () => {
  let store: FakeMediaStore;
  let svc: MediaLibraryService;
  beforeEach(() => {
    ({ store, svc } = setup());
  });

  it("archives and restores an asset", async () => {
    const a = store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1" });
    await svc.setArchived(CTX, a.id, true);
    expect(store.assets.find((x) => x.id === a.id)!.archivedAt).not.toBeNull();
    await svc.setArchived(CTX, a.id, false);
    expect(store.assets.find((x) => x.id === a.id)!.archivedAt).toBeNull();
  });

  it("404s archiving an asset from another agency", async () => {
    const a = store.seedAsset({ agencyId: "other", clientId: "cl1", contentItemId: "it1" });
    await expect(svc.setArchived(CTX, a.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("retention archives stale, unattached-to-published assets only", async () => {
    // Fixed clock so "olderThanDays" is deterministic.
    const now = new Date("2026-06-09T00:00:00Z");
    const svc2 = new MediaLibraryService({ store, clock: () => now });
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-06-08T00:00:00Z");
    // In-use item (published) protects its asset even if old.
    store.seedItem({ itemId: "pub", agencyId: "ag1", clientId: "cl1", status: "published" });
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", createdAt: old }); // stale → archive
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "pub", createdAt: old }); // in-use → keep
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", createdAt: recent }); // too new → keep
    store.seedAsset({
      agencyId: "ag1",
      clientId: "cl1",
      contentItemId: "it1",
      createdAt: old,
      source: "upload",
    }); // not reusable-generated → keep

    const { archived } = await svc2.runRetention(CTX, "cl1", 30);
    expect(archived).toBe(1);
  });

  it("rejects an out-of-range retention window", async () => {
    await expect(svc.runRetention(CTX, "cl1", 0)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
