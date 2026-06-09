// Server-component auth for the dashboard pages. Mirrors requireRequestAuth in
// the API layer (verify the session cookie → AuthContext) but, instead of
// throwing a JSON error, redirects unauthenticated visitors to the login page.
import { redirect } from "next/navigation";
import { readSessionToken } from "@/lib/auth/session";
import { requireAuth, requireRole, type AuthContext } from "@/lib/auth/guard";
import { requireEnv } from "@/lib/config/env";
import type { Role } from "@/lib/auth/roles";

/** Verify the current session, or null if absent/invalid. Never throws. */
export function getPageAuth(): AuthContext | null {
  try {
    return requireAuth(readSessionToken(), requireEnv("JWT_SECRET"));
  } catch {
    return null;
  }
}

/** Require a logged-in operator; redirect to /login otherwise. */
export function requirePageAuth(): AuthContext {
  const auth = getPageAuth();
  if (!auth) redirect("/login");
  return auth;
}

/**
 * Require one of the given roles; redirect home (not 403) when the visitor is
 * logged in but lacks the role, so reviewers never land on operator screens.
 */
export function requirePageRole(...roles: Role[]): AuthContext {
  const auth = requirePageAuth();
  try {
    requireRole(auth, ...roles);
  } catch {
    redirect("/dashboard");
  }
  return auth;
}
