import { describe, it, expect } from "vitest";
import { AuthService } from "./auth-service";
import { verifySession } from "./jwt";
import { FakeAuthStore } from "@/lib/repositories/fakes/fake-auth-stores";

const secret = "auth-service-secret-16-plus-chars";

function makeService() {
  const store = new FakeAuthStore();
  return { svc: new AuthService({ store, secret }), store };
}

describe("AuthService.signup", () => {
  it("creates an agency + admin user atomically and returns a verifiable token", async () => {
    const { svc, store } = makeService();
    const { token, user } = await svc.signup({
      agencyName: "Acme Co",
      email: "Owner@Acme.com ",
      password: "supersecret",
    });

    expect(store.agencies).toHaveLength(1);
    expect(store.users).toHaveLength(1);
    expect(user.role).toBe("agency_admin");
    expect(user.email).toBe("owner@acme.com"); // normalized
    expect("passwordHash" in user).toBe(false); // public projection
    expect(store.users[0]!.passwordHash).not.toContain("supersecret");

    const claims = verifySession(token, secret);
    expect(claims.agencyId).toBe(user.agencyId);
    expect(claims.sub).toBe(user.id);
  });

  it("rejects a duplicate email via the pre-check (409)", async () => {
    const { svc } = makeService();
    await svc.signup({ agencyName: "A", email: "a@b.com", password: "supersecret" });
    await expect(
      svc.signup({ agencyName: "B", email: "A@b.com", password: "supersecret" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps a unique-constraint race in the atomic create to 409 (no orphan agency)", async () => {
    const { svc, store } = makeService();
    // Seed a user directly so findByEmail (different casing path) misses but the
    // atomic create hits the unique constraint, exercising withDbErrors mapping.
    await store.createAgencyWithAdmin({
      agencyName: "Seed",
      email: "race@b.com",
      role: "agency_admin",
      passwordHash: "scrypt$00$00",
    });
    const before = store.agencies.length;
    // Force the create path to collide by bypassing the pre-check via a store
    // whose findUserByEmail always returns null.
    const racingSvc = new AuthService({
      store: {
        findUserByEmail: async () => null,
        createAgencyWithAdmin: store.createAgencyWithAdmin.bind(store),
      },
      secret,
    });
    await expect(
      racingSvc.signup({ agencyName: "X", email: "race@b.com", password: "supersecret" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.agencies.length).toBe(before); // no orphan agency added
  });
});

describe("AuthService.login", () => {
  it("logs in with correct credentials (email case-insensitive)", async () => {
    const { svc } = makeService();
    await svc.signup({ agencyName: "A", email: "a@b.com", password: "supersecret" });
    const { token, user } = await svc.login({ email: "A@B.com", password: "supersecret" });
    expect(user.email).toBe("a@b.com");
    expect(verifySession(token, secret).sub).toBe(user.id);
  });

  it("rejects a wrong password with a generic UNAUTHORIZED", async () => {
    const { svc } = makeService();
    await svc.signup({ agencyName: "A", email: "a@b.com", password: "supersecret" });
    await expect(
      svc.login({ email: "a@b.com", password: "wrongpass" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an unknown email with the same generic error", async () => {
    const { svc } = makeService();
    await expect(
      svc.login({ email: "nobody@b.com", password: "whatever1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("still runs a verify when the email is unknown (no timing oracle)", async () => {
    const store = new FakeAuthStore();
    let verifyCalls = 0;
    const svc = new AuthService({
      store,
      secret,
      hash: async () => "scrypt$00$00",
      verify: async () => {
        verifyCalls++;
        return false;
      },
    });
    await expect(
      svc.login({ email: "ghost@b.com", password: "whatever1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(verifyCalls).toBe(1); // dummy verify ran on the no-user branch
  });
});
