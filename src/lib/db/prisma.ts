// PrismaClient singleton. Cached on globalThis so Next.js hot-reload / multiple
// imports don't open a new connection pool each time. DATABASE_URL is read via
// the env gate at first use, so a missing URL fails loudly (not as a vague
// connection error).
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "@/lib/config/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: requireEnv("DATABASE_URL") } },
  });
}

/** Lazily-constructed shared client. Call only where a DB is expected. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
