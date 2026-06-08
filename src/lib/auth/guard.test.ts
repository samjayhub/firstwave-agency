import { describe, it, expect } from "vitest";
import { requireAuth, requireRole } from "./guard";
import { signSession } from "./jwt";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors/app-error";

const secret = "guard-secret-at-least-16-characters";
const token = signSession({ sub: "u1", agencyId: "ag1", role: "strategist" }, secret);

describe("requireAuth", () => {
  it("produces a tenant context from a valid token", () => {
    const auth = requireAuth(token, secret);
    expect(auth.ctx.agencyId).toBe("ag1");
    expect(auth.userId).toBe("u1");
    expect(auth.role).toBe("strategist");
  });

  it("throws when the token is missing", () => {
    expect(() => requireAuth(undefined, secret)).toThrow(UnauthorizedError);
    expect(() => requireAuth(null, secret)).toThrow(UnauthorizedError);
  });

  it("throws on an invalid token", () => {
    expect(() => requireAuth("garbage.token.here", secret)).toThrow(UnauthorizedError);
  });
});

describe("requireRole", () => {
  it("allows a permitted role", () => {
    const auth = requireAuth(token, secret);
    expect(() => requireRole(auth, "strategist", "agency_admin")).not.toThrow();
  });

  it("forbids a role outside the allow-list (403)", () => {
    const auth = requireAuth(token, secret);
    expect(() => requireRole(auth, "agency_admin")).toThrow(ForbiddenError);
  });
});
