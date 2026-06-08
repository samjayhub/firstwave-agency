import { describe, it, expect, afterAll } from "vitest";

// Real-database integration. Runs ONLY when a Postgres is available and opted in:
//   TEST_INTEGRATION=1 DATABASE_URL=postgres://... npm test
// Otherwise it appears as an explicitly-named SKIPPED test (surfaced in output,
// never silently dropped). Requires the schema to be migrated first.
const RUN = process.env.TEST_INTEGRATION === "1" && !!process.env.DATABASE_URL;

describe.skipIf(!RUN)("[integration] Prisma + ClientRepository against real Postgres", () => {
  // Imports are inside so the suite never loads PrismaClient when skipped.
  it("round-trips a client and enforces tenant isolation", async () => {
    const { getPrisma } = await import("./prisma");
    const { ClientRepository } = await import("@/lib/repositories/client-repository");
    const { prismaClientStore } = await import("@/lib/repositories/prisma-stores");

    const prisma = getPrisma();
    const repo = new ClientRepository(prismaClientStore(prisma));

    const agencyA = await prisma.agency.create({ data: { name: "IT Agency A" } });
    const agencyB = await prisma.agency.create({ data: { name: "IT Agency B" } });

    const created = await repo.create({ agencyId: agencyA.id }, { name: "IT Client" });
    const got = await repo.get({ agencyId: agencyA.id }, created.id);
    expect(got.name).toBe("IT Client");

    await expect(
      repo.get({ agencyId: agencyB.id }, created.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    afterAll(async () => {
      await prisma.client.deleteMany({ where: { id: created.id } });
      await prisma.agency.deleteMany({ where: { id: { in: [agencyA.id, agencyB.id] } } });
      await prisma.$disconnect();
    });
  });
});

// A guard that always runs so the skip is visible/explained rather than silent.
describe("integration gating", () => {
  it(RUN ? "integration enabled" : "integration disabled (set TEST_INTEGRATION=1 + DATABASE_URL)", () => {
    expect(typeof RUN).toBe("boolean");
  });
});
