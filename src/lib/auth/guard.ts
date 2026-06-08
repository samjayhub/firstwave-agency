// Tenancy guard. Every authenticated request passes through requireAuth, which
// verifies the session token and produces a validated TenantContext. Repositories
// take that context, so a request can only ever touch its own agency's rows.
import { ForbiddenError, UnauthorizedError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/db/tenancy";
import { verifySession } from "./jwt";
import type { Role } from "./roles";

export interface AuthContext {
  ctx: TenantContext;
  userId: string;
  role: Role;
}

/** Verify a raw token → AuthContext. Throws UnauthorizedError if absent/invalid. */
export function requireAuth(
  token: string | undefined | null,
  secret: string,
  opts?: { now?: number },
): AuthContext {
  if (!token) throw new UnauthorizedError("Authentication required");
  const claims = verifySession(token, secret, opts);
  return {
    ctx: { agencyId: claims.agencyId },
    userId: claims.sub,
    role: claims.role,
  };
}

/** Require that the caller holds one of the allowed roles. */
export function requireRole(auth: AuthContext, ...allowed: Role[]): void {
  if (!allowed.includes(auth.role)) {
    throw new ForbiddenError("You do not have permission to perform this action");
  }
}
