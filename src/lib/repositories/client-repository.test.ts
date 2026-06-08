import { describe, it, expect, beforeEach } from "vitest";
import { ClientRepository } from "./client-repository";
import { FakeClientStore } from "./fakes/fake-client-store";

// Integration-style: the repository runs against a faithful in-memory store, so
// these exercise real scoping + cursor-pagination behavior end-to-end (no DB).
const AGENCY_A = { agencyId: "agency_A" };
const AGENCY_B = { agencyId: "agency_B" };

// Monotonic clock so createdAt strictly increases → deterministic newest-first.
function tickingClock() {
  let t = 1_700_000_000_000;
  return () => new Date((t += 1000));
}

describe("ClientRepository", () => {
  let repo: ClientRepository;

  beforeEach(() => {
    repo = new ClientRepository(new FakeClientStore(tickingClock()));
  });

  it("creates and reads back a client within an agency", async () => {
    const created = await repo.create(AGENCY_A, { name: "Acme", niche: "fitness" });
    expect(created.agencyId).toBe("agency_A");
    const got = await repo.get(AGENCY_A, created.id);
    expect(got.name).toBe("Acme");
  });

  it("isolates tenants: agency B cannot read agency A's client", async () => {
    const a = await repo.create(AGENCY_A, { name: "Acme" });
    await expect(repo.get(AGENCY_B, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists only the calling agency's clients", async () => {
    await repo.create(AGENCY_A, { name: "A1" });
    await repo.create(AGENCY_B, { name: "B1" });
    await repo.create(AGENCY_A, { name: "A2" });
    const page = await repo.list(AGENCY_A);
    expect(page.items.map((c) => c.name).sort()).toEqual(["A1", "A2"]);
    expect(page.hasMore).toBe(false);
  });

  it("paginates with a cursor and never overlaps or skips rows", async () => {
    for (let i = 1; i <= 5; i++) await repo.create(AGENCY_A, { name: `C${i}` });

    const p1 = await repo.list(AGENCY_A, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.hasMore).toBe(true);

    const p2 = await repo.list(AGENCY_A, { limit: 2, cursor: p1.nextCursor! });
    const p3 = await repo.list(AGENCY_A, { limit: 2, cursor: p2.nextCursor! });
    expect(p3.items).toHaveLength(1);
    expect(p3.hasMore).toBe(false);

    const allIds = [...p1.items, ...p2.items, ...p3.items].map((c) => c.id);
    expect(new Set(allIds).size).toBe(5); // no duplicates across pages
  });

  it("returns an empty page when the cursor row is not in the agency's set", async () => {
    await repo.create(AGENCY_A, { name: "A1" });
    const b = await repo.create(AGENCY_B, { name: "B1" });
    // Page through agency A using a cursor that belongs to agency B.
    const page = await repo.list(AGENCY_A, { limit: 10, cursor: b.id });
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it("scopes updates to the owning agency", async () => {
    const a = await repo.create(AGENCY_A, { name: "Acme" });
    await expect(
      repo.update(AGENCY_B, a.id, { name: "Hacked" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const updated = await repo.update(AGENCY_A, a.id, { name: "Acme Renamed" });
    expect(updated.name).toBe("Acme Renamed");
  });
});
