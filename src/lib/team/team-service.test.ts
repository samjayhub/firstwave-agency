import { describe, it, expect, beforeEach } from "vitest";
import { TeamService } from "./team-service";
import { FakeTeamStore } from "@/lib/repositories/fakes/fake-team-store";

// Integration-style: the service runs against a faithful in-memory store, so
// these exercise real scoping + the last-admin invariant end-to-end (no DB).
// Hashing is stubbed so tests don't pay the scrypt cost and assertions are exact.
const AGENCY_A = { agencyId: "agency_A" };
const AGENCY_B = { agencyId: "agency_B" };

function tickingClock() {
  let t = 1_700_000_000_000;
  return () => new Date((t += 1000));
}

describe("TeamService", () => {
  let store: FakeTeamStore;
  let svc: TeamService;
  let admin: { id: string };

  beforeEach(() => {
    store = new FakeTeamStore(tickingClock());
    svc = new TeamService({ store, hash: async (p) => `hashed:${p}` });
    // Every agency starts with its founding admin (as signup creates).
    admin = store.seed({ agencyId: "agency_A", email: "admin@a.com", role: "agency_admin" });
  });

  it("invites a teammate and lists them within the agency", async () => {
    const member = await svc.invite(AGENCY_A, {
      email: "Strat@A.com",
      role: "strategist",
      password: "supersecret",
    });
    expect(member.role).toBe("strategist");
    expect(member.email).toBe("strat@a.com"); // normalized
    // No passwordHash ever leaks in the public projection.
    expect(member).not.toHaveProperty("passwordHash");

    const roster = await svc.list(AGENCY_A);
    expect(roster.map((m) => m.email).sort()).toEqual(["admin@a.com", "strat@a.com"]);
  });

  it("rejects a duplicate email with a 409", async () => {
    await svc.invite(AGENCY_A, { email: "dup@a.com", role: "strategist", password: "supersecret" });
    await expect(
      svc.invite(AGENCY_A, { email: "dup@a.com", role: "client_reviewer", password: "supersecret" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("isolates tenants: agency B cannot see or mutate agency A's users", async () => {
    const list = await svc.list(AGENCY_B);
    expect(list).toEqual([]);
    await expect(svc.updateRole(AGENCY_B, admin.id, "strategist")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(svc.remove(AGENCY_B, "other", admin.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("changes a teammate's role", async () => {
    const strat = await svc.invite(AGENCY_A, {
      email: "s@a.com",
      role: "strategist",
      password: "supersecret",
    });
    const updated = await svc.updateRole(AGENCY_A, strat.id, "client_reviewer");
    expect(updated.role).toBe("client_reviewer");
  });

  it("promotes a teammate to admin so another admin can exist", async () => {
    const strat = await svc.invite(AGENCY_A, {
      email: "s@a.com",
      role: "strategist",
      password: "supersecret",
    });
    await svc.updateRole(AGENCY_A, strat.id, "agency_admin");
    expect(await store.countAdmins("agency_A")).toBe(2);
  });

  describe("last-admin invariant", () => {
    it("refuses to demote the only admin", async () => {
      await expect(svc.updateRole(AGENCY_A, admin.id, "strategist")).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("refuses to remove the only admin", async () => {
      // A second user removes the admin (self-removal is separately blocked).
      const strat = store.seed({ agencyId: "agency_A", email: "s@a.com", role: "strategist" });
      await expect(svc.remove(AGENCY_A, strat.id, admin.id)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("allows demoting an admin once a second admin exists", async () => {
      const other = await svc.invite(AGENCY_A, {
        email: "admin2@a.com",
        role: "agency_admin",
        password: "supersecret",
      });
      const demoted = await svc.updateRole(AGENCY_A, other.id, "strategist");
      expect(demoted.role).toBe("strategist");
      expect(await store.countAdmins("agency_A")).toBe(1);
    });
  });

  it("blocks self-removal", async () => {
    await expect(svc.remove(AGENCY_A, admin.id, admin.id)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("removes a teammate", async () => {
    const strat = await svc.invite(AGENCY_A, {
      email: "s@a.com",
      role: "strategist",
      password: "supersecret",
    });
    await svc.remove(AGENCY_A, admin.id, strat.id);
    const roster = await svc.list(AGENCY_A);
    expect(roster.map((m) => m.email)).toEqual(["admin@a.com"]);
  });

  it("404s updating or removing a non-existent user", async () => {
    await expect(svc.updateRole(AGENCY_A, "ghost", "strategist")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(svc.remove(AGENCY_A, admin.id, "ghost")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("treats a same-role update as a no-op without touching the admin guard", async () => {
    // Updating the sole admin to admin must NOT trip the last-admin guard.
    const same = await svc.updateRole(AGENCY_A, admin.id, "agency_admin");
    expect(same.role).toBe("agency_admin");
  });
});
