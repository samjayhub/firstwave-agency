// Bearer-token auth for the public /api/v1 surface (P4-08). Distinct from the
// session-cookie auth the dashboard/admin routes use: here the credential is a
// per-agency API key in the Authorization header, resolving to a TenantContext.
import { apiKeyService } from "@/app/api/_lib/deps";
import { UnauthorizedError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/db/tenancy";

/** Extract a bearer token from the Authorization header, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (!value || scheme?.toLowerCase() !== "bearer") return null;
  return value.trim();
}

/** Authenticate a public-API request; throws 401 if the key is missing/invalid. */
export async function requireApiAuth(req: Request): Promise<TenantContext> {
  const ctx = await apiKeyService().authenticate(bearerToken(req));
  if (!ctx) throw new UnauthorizedError("A valid API key is required");
  return ctx;
}
