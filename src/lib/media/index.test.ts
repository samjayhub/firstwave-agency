import { describe, it, expect, beforeEach } from "vitest";
import { MediaLibraryService } from "./index";
import { FakeMediaStore } from "./fakes";
import { InMemoryAssetStorage } from "@/lib/creative/asset-storage";

const CTX = { agencyId: "ag1" };
const NOW = new Date("2026-06-09T00:00:00Z");
const OLD = new Date("2026-01-01T00:00:00Z");

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

describe("MediaLibraryService — purge (stage two)", () => {
  let store: FakeMediaStore;
  let storage: InMemoryAssetStorage;
  let svc: MediaLibraryService;
  beforeEach(() => {
    store = new FakeMediaStore();
    store.seedItem({ itemId: "it1", agencyId: "ag1", clientId: "cl1", status: "draft" });
    storage = new InMemoryAssetStorage();
    svc = new MediaLibraryService({ store, storage, clock: () => NOW });
  });

  it("hard-deletes long-archived assets and GCs their blob", async () => {
    await storage.put("cl1/old.png", Buffer.from("x"), "image/png");
    store.seedAsset({
      agencyId: "ag1",
      clientId: "cl1",
      contentItemId: "it1",
      url: "memory://cl1/old.png",
      archivedAt: OLD,
    });
    const res = await svc.purgeArchived(CTX, "cl1", 30);
    expect(res).toEqual({ purged: 1, blobsDeleted: 1 });
    expect(storage.objects.has("cl1/old.png")).toBe(false);
    expect(store.assets).toHaveLength(0);
  });

  it("keeps a blob still referenced by a surviving (deduped) asset", async () => {
    await storage.put("cl1/shared.png", Buffer.from("x"), "image/png");
    const url = "memory://cl1/shared.png";
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", url, archivedAt: OLD });
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "it1", url }); // live, shares the blob
    const res = await svc.purgeArchived(CTX, "cl1", 30);
    expect(res).toEqual({ purged: 1, blobsDeleted: 0 });
    expect(storage.objects.has("cl1/shared.png")).toBe(true); // GC skipped — still referenced
    expect(store.assets).toHaveLength(1);
  });

  it("does not purge assets archived more recently than the window", async () => {
    store.seedAsset({
      agencyId: "ag1",
      clientId: "cl1",
      contentItemId: "it1",
      archivedAt: new Date("2026-06-08T00:00:00Z"), // 1 day ago
    });
    expect(await svc.purgeArchived(CTX, "cl1", 30)).toEqual({ purged: 0, blobsDeleted: 0 });
  });

  it("rejects a negative purge window", async () => {
    await expect(svc.purgeArchived(CTX, "cl1", -1)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("MediaLibraryService — scheduled sweep", () => {
  it("archives stale then purges long-archived across every client, in one pass", async () => {
    const store = new FakeMediaStore();
    store.seedItem({ itemId: "a", agencyId: "ag1", clientId: "cl1", status: "draft" });
    store.seedItem({ itemId: "b", agencyId: "ag1", clientId: "cl2", status: "draft" });
    const svc = new MediaLibraryService({
      store,
      storage: new InMemoryAssetStorage(),
      clock: () => NOW,
    });
    // cl1: a stale generated asset → soft-archived this pass.
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "a", createdAt: OLD });
    // cl2: an already-long-archived asset → purged this pass.
    store.seedAsset({ agencyId: "ag1", clientId: "cl2", contentItemId: "b", archivedAt: OLD });

    const res = await svc.runRetentionSweep(90, 30);
    expect(res.clients).toBe(2);
    expect(res.archived).toBe(1);
    expect(res.purged).toBe(1);
    // The just-archived cl1 asset is stamped at NOW, so it is NOT purged this pass.
    expect(store.assets.find((x) => x.clientId === "cl1")!.archivedAt).toEqual(NOW);
  });

  it("archive-only when purgeDays is null", async () => {
    const store = new FakeMediaStore();
    store.seedItem({ itemId: "a", agencyId: "ag1", clientId: "cl1", status: "draft" });
    store.seedAsset({ agencyId: "ag1", clientId: "cl1", contentItemId: "a", archivedAt: OLD });
    const svc = new MediaLibraryService({ store, clock: () => NOW });
    const res = await svc.runRetentionSweep(90, null);
    expect(res.purged).toBe(0);
    expect(store.assets).toHaveLength(1); // nothing hard-deleted
  });
});
