// Minimal HS256 session token (JWT shape) built on node:crypto — no JWT library.
// Deliberately supports ONLY HS256 and rejects everything else, closing the
// classic "alg" confusion / "alg: none" attacks. Signature compare is constant
// time; expiry is enforced.
import { createHmac, timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "@/lib/errors/app-error";
import { isRole, type Role } from "./roles";

export interface SessionClaims {
  /** userId */
  sub: string;
  agencyId: string;
  role: Role;
}

interface JwtPayload extends SessionClaims {
  iat: number;
  exp: number;
}

export const DEFAULT_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function encodeJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj)));
}
function decodeJson(segment: string): unknown {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}
function hmac(input: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(input).digest());
}

export function signSession(
  claims: SessionClaims,
  secret: string,
  opts?: { ttlSeconds?: number; now?: number },
): string {
  const iat = Math.floor((opts?.now ?? Date.now()) / 1000);
  const exp = iat + (opts?.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({ ...claims, iat, exp } satisfies JwtPayload);
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${hmac(signingInput, secret)}`;
}

export function verifySession(
  token: string,
  secret: string,
  opts?: { now?: number },
): SessionClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new UnauthorizedError("Invalid session token");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: unknown };
  try {
    header = decodeJson(headerB64) as { alg?: unknown };
  } catch {
    throw new UnauthorizedError("Invalid session token");
  }
  if (header.alg !== "HS256") {
    throw new UnauthorizedError("Unsupported token algorithm");
  }

  const expected = hmac(`${headerB64}.${payloadB64}`, secret);
  const got = Buffer.from(signatureB64);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    throw new UnauthorizedError("Invalid session signature");
  }

  let payload: JwtPayload;
  try {
    payload = decodeJson(payloadB64) as JwtPayload;
  } catch {
    throw new UnauthorizedError("Invalid session token");
  }

  const now = Math.floor((opts?.now ?? Date.now()) / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new UnauthorizedError("Session expired");
  }
  if (!payload.sub || !payload.agencyId || !isRole(payload.role)) {
    throw new UnauthorizedError("Malformed session claims");
  }
  return { sub: payload.sub, agencyId: payload.agencyId, role: payload.role };
}
