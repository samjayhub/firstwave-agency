// Prisma-backed implementations of the repository store interfaces. Kept apart
// from the repository logic so tests never import PrismaClient. The `select`
// pins the returned shape to the record type the repository expects.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ClientStore } from "./client-repository";
import type { AuthStore } from "@/lib/auth/auth-service";
// Type-only imports keep the brand-intel/LLM runtime out of route bundles.
import type { BrandProfileStore } from "@/lib/brand-intel";
import type {
  BrandFont,
  BrandProfileData,
  BrandVoice,
  PaletteColor,
} from "@/lib/brand-intel/types";

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

const AUTH_USER_SELECT = {
  id: true,
  agencyId: true,
  email: true,
  role: true,
  passwordHash: true,
} as const;

export function prismaBrandProfileStore(prisma: PrismaClient): BrandProfileStore {
  return {
    upsert: async (clientId, data) => {
      const payload = {
        voice: data.voice as unknown as Prisma.InputJsonValue,
        palette: data.palette as unknown as Prisma.InputJsonValue,
        fonts: data.fonts as unknown as Prisma.InputJsonValue,
        logoUrl: data.logoUrl ?? null,
      };
      await prisma.brandProfile.upsert({
        where: { clientId },
        create: { clientId, ...payload },
        update: payload,
      });
    },
    findByClient: async (clientId): Promise<BrandProfileData | null> => {
      const row = await prisma.brandProfile.findUnique({
        where: { clientId },
        select: { voice: true, palette: true, fonts: true, logoUrl: true },
      });
      if (!row || row.voice == null) return null;
      return {
        voice: row.voice as unknown as BrandVoice,
        palette: (row.palette ?? []) as unknown as PaletteColor[],
        fonts: (row.fonts ?? []) as unknown as BrandFont[],
        ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
      };
    },
  };
}

export function prismaAuthStore(prisma: PrismaClient): AuthStore {
  return {
    findUserByEmail: (email) =>
      prisma.user.findUnique({ where: { email }, select: AUTH_USER_SELECT }),
    // Single transaction: if the user insert fails (e.g. unique-email race), the
    // agency insert rolls back — no orphaned agency.
    createAgencyWithAdmin: ({ agencyName, email, role, passwordHash }) =>
      prisma.$transaction(async (tx) => {
        const agency = await tx.agency.create({
          data: { name: agencyName },
          select: { id: true, name: true },
        });
        const user = await tx.user.create({
          data: { agencyId: agency.id, email, role, passwordHash },
          select: AUTH_USER_SELECT,
        });
        return { agency, user };
      }),
  };
}
