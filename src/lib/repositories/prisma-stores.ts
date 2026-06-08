// Prisma-backed implementations of the repository store interfaces. Kept apart
// from the repository logic so tests never import PrismaClient. The `select`
// pins the returned shape to the record type the repository expects.
import type { Prisma, PrismaClient } from "@prisma/client";
import { NotFoundError } from "@/lib/errors/app-error";
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
import type { ContentPlanStore } from "@/lib/planner";
import type { ContentItemStore } from "@/lib/copy";
import type { StoredCopy } from "@/lib/content/types";
import type { AssetRepository } from "@/lib/creative";
import type { ApprovalStore, ItemStatus } from "@/lib/approval";
import type { ConnectedAccountRepository } from "@/lib/connections";
import type { PublishJobStore } from "@/lib/publish/job";
import type { Platform } from "@/lib/publishers/types";
import type { ResearchBrief, ResearchBriefStore } from "@/lib/research/types";

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

export function prismaContentPlanStore(prisma: PrismaClient): ContentPlanStore {
  return {
    createPlanWithItems: (agencyId, clientId, startDate, items) =>
      prisma.$transaction(async (tx) => {
        // Isolation in the predicate: the client must belong to the agency.
        const client = await tx.client.findFirst({
          where: { id: clientId, agencyId },
          select: { id: true },
        });
        if (!client) throw new NotFoundError("Client not found");
        const plan = await tx.contentPlan.create({
          data: { clientId, startDate },
          select: { id: true },
        });
        const out: Array<{ contentItemId: string; brief: StoredCopy["brief"] }> = [];
        for (const it of items) {
          const row = await tx.contentItem.create({
            data: {
              planId: plan.id,
              scheduledAt: it.scheduledAt,
              status: "draft",
              copy: it.copy as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          out.push({ contentItemId: row.id, brief: it.copy.brief });
        }
        return { planId: plan.id, items: out };
      }),
    latestForClient: async (agencyId, clientId) => {
      const plan = await prisma.contentPlan.findFirst({
        where: { clientId, client: { agencyId } },
        orderBy: { createdAt: "desc" },
        select: { id: true, startDate: true, items: { select: { id: true, copy: true } } },
      });
      if (!plan) return null;
      return {
        planId: plan.id,
        startDate: plan.startDate,
        items: plan.items.map((i) => ({
          contentItemId: i.id,
          copy: (i.copy ?? null) as unknown as StoredCopy | null,
        })),
      };
    },
  };
}

export function prismaContentItemStore(prisma: PrismaClient): ContentItemStore {
  return {
    findForAgency: async (agencyId, itemId) => {
      const row = await prisma.contentItem.findFirst({
        where: { id: itemId, plan: { client: { agencyId } } },
        select: { id: true, copy: true, plan: { select: { clientId: true } } },
      });
      if (!row) return null;
      return { id: row.id, clientId: row.plan.clientId, copy: row.copy };
    },
    updateCopy: async (agencyId, itemId, copy) => {
      const res = await prisma.contentItem.updateMany({
        where: { id: itemId, plan: { client: { agencyId } } },
        data: { copy: copy as unknown as Prisma.InputJsonValue },
      });
      return res.count > 0;
    },
  };
}

const ASSET_SELECT = {
  id: true,
  contentItemId: true,
  kind: true,
  url: true,
  source: true,
  createdAt: true,
} as const;

export function prismaAssetRepository(prisma: PrismaClient): AssetRepository {
  return {
    create: (agencyId, input) =>
      prisma.$transaction(async (tx) => {
        // Isolation in the predicate: the content item must belong to the agency.
        const item = await tx.contentItem.findFirst({
          where: { id: input.contentItemId, plan: { client: { agencyId } } },
          select: { id: true },
        });
        if (!item) throw new NotFoundError("Content item not found");
        return tx.asset.create({
          data: {
            contentItemId: input.contentItemId,
            kind: input.kind,
            url: input.url,
            source: input.source,
            meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
          },
          select: ASSET_SELECT,
        });
      }),
    listForItem: (agencyId, itemId) =>
      prisma.asset.findMany({
        where: { contentItemId: itemId, contentItem: { plan: { client: { agencyId } } } },
        orderBy: { createdAt: "desc" },
        select: ASSET_SELECT,
      }),
  };
}

export function prismaApprovalStore(prisma: PrismaClient): ApprovalStore {
  return {
    get: async (agencyId, itemId) => {
      const row = await prisma.contentItem.findFirst({
        where: { id: itemId, plan: { client: { agencyId } } },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          copy: true,
          plan: { select: { clientId: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        clientId: row.plan.clientId,
        status: row.status as ItemStatus,
        scheduledAt: row.scheduledAt,
        copy: row.copy,
      };
    },
    transition: async (agencyId, itemId, from, to) => {
      const res = await prisma.contentItem.updateMany({
        where: { id: itemId, status: from, plan: { client: { agencyId } } },
        data: { status: to },
      });
      return res.count > 0;
    },
    listByClient: async (agencyId, clientId, status) => {
      const rows = await prisma.contentItem.findMany({
        where: {
          plan: { clientId, client: { agencyId } },
          ...(status ? { status } : {}),
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          copy: true,
          plan: { select: { clientId: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        clientId: r.plan.clientId,
        status: r.status as ItemStatus,
        scheduledAt: r.scheduledAt,
        copy: r.copy,
      }));
    },
  };
}

export function prismaConnectedAccountRepository(
  prisma: PrismaClient,
): ConnectedAccountRepository {
  return {
    create: (agencyId, input) =>
      prisma.$transaction(async (tx) => {
        const client = await tx.client.findFirst({
          where: { id: input.clientId, agencyId },
          select: { id: true },
        });
        if (!client) throw new NotFoundError("Client not found");
        const row = await tx.connectedAccount.create({
          data: {
            clientId: input.clientId,
            platform: input.platform,
            externalId: input.externalId,
            handle: input.handle ?? null,
            accessToken: input.accessTokenEnc,
            refreshToken: input.refreshTokenEnc ?? null,
            expiresAt: input.expiresAt ?? null,
          },
          select: { id: true },
        });
        return { id: row.id };
      }),
    getForAgency: async (agencyId, accountId) => {
      const row = await prisma.connectedAccount.findFirst({
        where: { id: accountId, client: { agencyId } },
        select: {
          id: true,
          clientId: true,
          platform: true,
          externalId: true,
          handle: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
        },
      });
      if (!row || !row.externalId) return null;
      return {
        id: row.id,
        clientId: row.clientId,
        platform: row.platform as Platform,
        externalId: row.externalId,
        handle: row.handle,
        accessTokenEnc: row.accessToken,
        refreshTokenEnc: row.refreshToken,
        expiresAt: row.expiresAt,
      };
    },
    listForClient: async (agencyId, clientId) => {
      const rows = await prisma.connectedAccount.findMany({
        where: { clientId, client: { agencyId } },
        select: { id: true, platform: true, handle: true, externalId: true },
      });
      return rows.map((r) => ({
        id: r.id,
        platform: r.platform as Platform,
        handle: r.handle,
        externalId: r.externalId ?? "",
      }));
    },
  };
}

export function prismaPublishJobStore(prisma: PrismaClient): PublishJobStore {
  return {
    create: (input) =>
      prisma.publishJob.create({
        data: {
          contentItemId: input.contentItemId,
          platform: input.platform,
          state: input.state,
        },
        select: { id: true },
      }),
    markResult: async (id, result) => {
      await prisma.publishJob.update({
        where: { id },
        data: {
          state: result.state,
          externalId: result.externalId ?? null,
          error: result.error ?? null,
        },
      });
    },
  };
}

export function prismaResearchBriefStore(prisma: PrismaClient): ResearchBriefStore {
  return {
    saveBrief: async (agencyId, clientId, brief) => {
      await prisma.client.updateMany({
        where: { id: clientId, agencyId },
        data: { researchBrief: brief as unknown as Prisma.InputJsonValue },
      });
    },
    getBrief: async (agencyId, clientId) => {
      const row = await prisma.client.findFirst({
        where: { id: clientId, agencyId },
        select: { researchBrief: true },
      });
      if (!row || row.researchBrief == null) return null;
      return row.researchBrief as unknown as ResearchBrief;
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
