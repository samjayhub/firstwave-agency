// Request-scoped wiring: build services/repositories from the real Prisma client
// and validated env. Kept out of the route files so handlers stay thin.
import { getPrisma } from "@/lib/db/prisma";
import { requireEnv } from "@/lib/config/env";
import { AuthService } from "@/lib/auth/auth-service";
import { requireAuth, type AuthContext } from "@/lib/auth/guard";
import { readSessionToken } from "@/lib/auth/session";
import { ClientRepository } from "@/lib/repositories/client-repository";
import {
  prismaAuthStore,
  prismaClientStore,
} from "@/lib/repositories/prisma-stores";

export function authService(): AuthService {
  return new AuthService({
    store: prismaAuthStore(getPrisma()),
    secret: requireEnv("JWT_SECRET"),
  });
}

export function clientRepository(): ClientRepository {
  return new ClientRepository(prismaClientStore(getPrisma()));
}

/** Authenticate the current request from its session cookie. */
export function requireRequestAuth(): AuthContext {
  return requireAuth(readSessionToken(), requireEnv("JWT_SECRET"));
}
