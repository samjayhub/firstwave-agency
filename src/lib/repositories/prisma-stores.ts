// Prisma-backed implementations of the repository store interfaces. Kept apart
// from the repository logic so tests never import PrismaClient. The `select`
// pins the returned shape to the record type the repository expects.
import type { PrismaClient } from "@prisma/client";
import type { ClientStore } from "./client-repository";

const CLIENT_SELECT = {
  id: true,
  agencyId: true,
  name: true,
  websiteUrl: true,
  niche: true,
  createdAt: true,
} as const;

export function prismaClientStore(prisma: PrismaClient): ClientStore {
  return {
    create: ({ data }) => prisma.client.create({ data, select: CLIENT_SELECT }),
    findMany: (args) => prisma.client.findMany({ ...args, select: CLIENT_SELECT }),
    findFirst: ({ where }) => prisma.client.findFirst({ where, select: CLIENT_SELECT }),
    // Scoped write: updateMany filters on (id AND agencyId); count 0 => no match.
    update: async ({ where, data }) => {
      const res = await prisma.client.updateMany({ where, data });
      if (res.count === 0) return null;
      return prisma.client.findFirst({ where, select: CLIENT_SELECT });
    },
  };
}
