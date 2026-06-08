import { describe, it, expect } from "vitest";
import { signSession, verifySession, type SessionClaims } from "./jwt";
import { UnauthorizedError } from "@/lib/errors/app-error";

const secret = "test-secret-at-least-16-chars-long";
const claims: SessionClaims = { sub: "user_1", agencyId: "agency_1", role: "agency_admin" };

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

describe("session JWT", () => {
  it("round-trips claims", () => {
    const token = signSession(claims, secret, { now: 1_000_000 });
    expect(verifySession(token, secret, { now: 1_000_000 })).toEqual(claims);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession(claims, secret);
    expect(() => verifySession(token, "a-totally-different-secret-x")).toThrow(
      UnauthorizedError,
    );
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const token = signSession(claims, secret);
    const [header, , signature] = token.split(".");
    const forgedPayload = b64url({ ...claims, agencyId: "agency_2", iat: 1, exp: 9_999_999_999 });
    const forged = `${header}.${forgedPayload}.${signature}`;
    expect(() => verifySession(forged, secret)).toThrow(UnauthorizedError);
  });

  it("rejects an expired token", () => {
    const token = signSession(claims, secret, { now: 0, ttlSeconds: 60 });
    expect(() => verifySession(token, secret, { now: 120_000 })).toThrow(/expired/i);
  });

  it("rejects alg-confusion / alg:none tokens", () => {
    const header = b64url({ alg: "none", typ: "JWT" });
    const payload = b64url({ ...claims, iat: 1, exp: 9_999_999_999 });
    expect(() => verifySession(`${header}.${payload}.`, secret)).toThrow(/algorithm/i);
  });

  it("rejects malformed tokens", () => {
    expect(() => verifySession("a.b", secret)).toThrow(UnauthorizedError);
    expect(() => verifySession("not-a-token", secret)).toThrow(UnauthorizedError);
  });
});
