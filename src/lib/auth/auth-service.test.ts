import { describe, it, expect } from "vitest";
import { AuthService } from "./auth-service";
import { verifySession } from "./jwt";
import {
  FakeAgencyStore,
  FakeUserStore,
} from "@/lib/repositories/fakes/fake-auth-stores";

const secret = "auth-service-secret-16-plus-chars";

function makeService() {
  const agencies = new FakeAgencyStore();
  const users = new FakeUserStore();
  return { svc: new AuthService({ agencies, users, secret }), agencies, users };
}

describe("AuthService.signup", () => {
  it("creates an agency + admin user and returns a verifiable token", async () => {
    const { svc, agencies, users } = makeService();
    const { token, user } = await svc.signup({
      agencyName: "Acme Co",
      email: "Owner@Acme.com ",
      password: "supersecret",
    });

    expect(agencies.rows).toHaveLength(1);
    expect(user.role).toBe("agency_admin");
    expect(user.email).toBe("owner@acme.com"); // normalized
    expect("passwordHash" in user).toBe(false); // public projection
    expect(users.rows[0]!.passwordHash).not.toContain("supersecret");

    const claims = verifySession(token, secret);
    expect(claims.agencyId).toBe(user.agencyId);
    expect(claims.sub).toBe(user.id);
  });

  it("rejects a duplicate email", async () => {
    const { svc } = makeService();
    await svc.signup({ agencyName: "A", email: "a@b.com", password: "supersecret" });
    await expect(
      svc.signup({ agencyName: "B", email: "A@b.com", password: "supersecret" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
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
});
