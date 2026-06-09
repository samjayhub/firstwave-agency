// Prisma-backed implementations of the repository store interfaces. Kept apart
// from the repository logic so tests never import PrismaClient. The `select`
// pins the returned shape to the record type the repository expects.
import type { Prisma, PrismaClient } from "@prisma/client";
import { NotFoundError } from "@/lib/errors/app-error";
import type { ClientStore } from "./client-repository";
import type { AuthStore } from "@/lib/auth/auth-service";
import type { Role } from "@/lib/auth/roles";
import type { TeamStore } from "@/lib/team/types";
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
import type { CompetitorBrief, CompetitorStore } from "@/lib/competitor/types";
import type { TrendBrief, TrendStore } from "@/lib/trend/types";
import type { AnalyticsStore, PostMetrics } from "@/lib/analytics/types";
import type { BillingStore } from "@/lib/billing/types";
import type { BrandingStore } from "@/lib/whitelabel/types";
import type { DesignItemStore, DesignSpec } from "@/lib/design/types";
import type { SchedulerStore } from "@/lib/scheduler/types";
import type { PerformanceStore } from "@/lib/performance/types";
import type { ReviewStore } from "@/lib/review/types";
import type { NotificationKind, NotificationStore } from "@/lib/notifications/types";
import type { ReportStore } from "@/lib/reporting/types";

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

export function prismaDesignItemStore(prisma: PrismaClient): DesignItemStore {
  return {
    findForAgency: async (agencyId, itemId) => {
      const row = await prisma.contentItem.findFirst({
        where: { id: itemId, plan: { client: { agencyId } } },
        select: { id: true, copy: true, plan: { select: { clientId: true } } },
      });
      if (!row) return null;
      return { id: row.id, clientId: row.plan.clientId, copy: row.copy };
    },
    saveSpec: async (agencyId, itemId, spec: DesignSpec) => {
      const res = await prisma.contentItem.updateMany({
        where: { id: itemId, plan: { client: { agencyId } } },
        data: { designSpec: spec as unknown as Prisma.InputJsonValue },
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

export function prismaSchedulerStore(prisma: PrismaClient): SchedulerStore {
  return {
    findDueItems: async (now, limit, agencyId) => {
      const rows = await prisma.contentItem.findMany({
        where: {
          status: "approved",
          scheduledAt: { not: null, lte: now },
          targets: { some: {} },
          ...(agencyId ? { plan: { client: { agencyId } } } : {}),
        },
        select: {
          id: true,
          plan: { select: { client: { select: { agencyId: true } } } },
          // First target account decides where this item publishes (one item →
          // one publish lifecycle, mirroring the manual publish route).
          targets: { select: { id: true, platform: true }, take: 1 },
        },
        orderBy: { scheduledAt: "asc" },
        take: limit,
      });
      return rows
        .filter((r) => r.targets.length > 0)
        .map((r) => ({
          agencyId: r.plan.client.agencyId,
          itemId: r.id,
          connectedAccountId: r.targets[0]!.id,
          platform: r.targets[0]!.platform,
        }));
    },
    markScheduled: async (agencyId, itemId) => {
      const res = await prisma.contentItem.updateMany({
        where: { id: itemId, status: "approved", plan: { client: { agencyId } } },
        data: { status: "scheduled" },
      });
      return res.count > 0;
    },
  };
}

export function prismaReportStore(prisma: PrismaClient): ReportStore {
  return {
    snapshotsForClient: async (agencyId, clientId, since) => {
      const jobs = await prisma.publishJob.findMany({
        where: {
          state: "published",
          snapshots: { some: {} },
          createdAt: { gte: since },
          contentItem: { plan: { client: { id: clientId, agencyId } } },
        },
        select: {
          platform: true,
          createdAt: true,
          contentItem: { select: { copy: true } },
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { metrics: true, capturedAt: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return jobs.map((j) => {
        const copy = j.contentItem.copy as StoredCopy | null;
        return {
          platform: j.platform as Platform,
          metrics: (j.snapshots[0]?.metrics ?? {}) as PostMetrics,
          ...(copy?.brief?.idea ? { idea: copy.brief.idea } : {}),
          capturedAt: j.snapshots[0]?.capturedAt ?? j.createdAt,
        };
      });
    },
    digestTargets: async () => {
      const brandings = await prisma.agencyBranding.findMany({
        where: { supportEmail: { not: null } },
        select: {
          agencyId: true,
          supportEmail: true,
          agency: { select: { clients: { select: { id: true, name: true } } } },
        },
      });
      const targets = [];
      for (const b of brandings) {
        for (const c of b.agency.clients) {
          targets.push({
            agencyId: b.agencyId,
            clientId: c.id,
            clientName: c.name,
            recipient: b.supportEmail!,
          });
        }
      }
      return targets;
    },
  };
}

export function prismaNotificationStore(prisma: PrismaClient): NotificationStore {
  return {
    save: (event) =>
      prisma.notification.create({
        data: {
          agencyId: event.agencyId,
          kind: event.kind,
          title: event.title,
          body: event.body,
        },
        select: { id: true, kind: true, title: true, body: true, readAt: true, createdAt: true },
      }).then((r) => ({ ...r, kind: r.kind as NotificationKind })),
    list: async (agencyId, limit) => {
      const rows = await prisma.notification.findMany({
        where: { agencyId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, kind: true, title: true, body: true, readAt: true, createdAt: true },
      });
      return rows.map((r) => ({ ...r, kind: r.kind as NotificationKind }));
    },
    markRead: async (agencyId, id) => {
      const res = await prisma.notification.updateMany({
        where: { id, agencyId, readAt: null },
        data: { readAt: new Date() },
      });
      return res.count > 0;
    },
    getSettings: async (agencyId) => {
      const row = await prisma.notificationSetting.findUnique({
        where: { agencyId },
        select: { agencyId: true, slackWebhookUrl: true, emailTo: true, mutedKinds: true },
      });
      if (!row) return null;
      return { ...row, mutedKinds: row.mutedKinds as NotificationKind[] };
    },
    upsertSettings: async (agencyId, patch) => {
      const row = await prisma.notificationSetting.upsert({
        where: { agencyId },
        create: {
          agencyId,
          slackWebhookUrl: patch.slackWebhookUrl ?? null,
          emailTo: patch.emailTo ?? null,
          mutedKinds: patch.mutedKinds ?? [],
        },
        update: {
          ...(patch.slackWebhookUrl !== undefined ? { slackWebhookUrl: patch.slackWebhookUrl } : {}),
          ...(patch.emailTo !== undefined ? { emailTo: patch.emailTo } : {}),
          ...(patch.mutedKinds !== undefined ? { mutedKinds: patch.mutedKinds } : {}),
        },
        select: { agencyId: true, slackWebhookUrl: true, emailTo: true, mutedKinds: true },
      });
      return { ...row, mutedKinds: row.mutedKinds as NotificationKind[] };
    },
  };
}

export function prismaReviewStore(prisma: PrismaClient): ReviewStore {
  return {
    createShare: async (agencyId, clientId, token) => {
      // Only mint for a client the agency owns.
      const owned = await prisma.client.findFirst({
        where: { id: clientId, agencyId },
        select: { id: true },
      });
      if (!owned) return null;
      const row = await prisma.reviewShare.create({
        data: { clientId, token },
        select: { id: true, clientId: true, token: true, revoked: true, createdAt: true },
      });
      return row;
    },
    listShares: (agencyId, clientId) =>
      prisma.reviewShare.findMany({
        where: { clientId, client: { agencyId } },
        select: { id: true, clientId: true, token: true, revoked: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    revokeShare: async (agencyId, shareId) => {
      const res = await prisma.reviewShare.updateMany({
        where: { id: shareId, revoked: false, client: { agencyId } },
        data: { revoked: true },
      });
      return res.count > 0;
    },
    resolveShare: async (token) => {
      const row = await prisma.reviewShare.findFirst({
        where: { token, revoked: false },
        select: { clientId: true, client: { select: { agencyId: true, name: true } } },
      });
      if (!row) return null;
      return {
        clientId: row.clientId,
        agencyId: row.client.agencyId,
        clientName: row.client.name,
      };
    },
    queueForClient: async (clientId) => {
      const rows = await prisma.contentItem.findMany({
        where: { status: "in_review", plan: { clientId } },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          copy: true,
          reviewComments: {
            orderBy: { createdAt: "asc" },
            select: { id: true, body: true, author: true, createdAt: true },
          },
        },
        orderBy: { scheduledAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status as ItemStatus,
        scheduledAt: r.scheduledAt,
        copy: r.copy,
        comments: r.reviewComments,
      }));
    },
    getItem: async (clientId, itemId) => {
      const r = await prisma.contentItem.findFirst({
        where: { id: itemId, plan: { clientId } },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          copy: true,
          reviewComments: {
            orderBy: { createdAt: "asc" },
            select: { id: true, body: true, author: true, createdAt: true },
          },
        },
      });
      if (!r) return null;
      return {
        id: r.id,
        status: r.status as ItemStatus,
        scheduledAt: r.scheduledAt,
        copy: r.copy,
        comments: r.reviewComments,
      };
    },
    transition: async (clientId, itemId, from, to) => {
      const res = await prisma.contentItem.updateMany({
        where: { id: itemId, status: from, plan: { clientId } },
        data: { status: to },
      });
      return res.count > 0;
    },
    addComment: async (clientId, itemId, body, author) => {
      // Confirm the item belongs to this client before attaching a comment.
      const item = await prisma.contentItem.findFirst({
        where: { id: itemId, plan: { clientId } },
        select: { id: true },
      });
      if (!item) return null;
      return prisma.reviewComment.create({
        data: { contentItemId: itemId, body, author },
        select: { id: true, body: true, author: true, createdAt: true },
      });
    },
  };
}

export function prismaPerformanceStore(prisma: PrismaClient): PerformanceStore {
  return {
    recentPerformance: async (agencyId, clientId, limit) => {
      // Published posts on this client that have at least one metrics snapshot,
      // newest-published first, each joined to its LATEST snapshot + plan brief.
      const jobs = await prisma.publishJob.findMany({
        where: {
          state: "published",
          snapshots: { some: {} },
          contentItem: { plan: { client: { id: clientId, agencyId } } },
        },
        select: {
          platform: true,
          contentItem: { select: { copy: true } },
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { metrics: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return jobs.map((j) => {
        const copy = j.contentItem.copy as StoredCopy | null;
        const metrics = (j.snapshots[0]?.metrics ?? {}) as PostMetrics;
        return {
          platform: j.platform as Platform,
          ...(copy?.brief?.pillar ? { pillar: copy.brief.pillar } : {}),
          ...(copy?.brief?.format ? { format: copy.brief.format } : {}),
          ...(copy?.brief?.idea ? { idea: copy.brief.idea } : {}),
          metrics,
        };
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

export function prismaCompetitorStore(prisma: PrismaClient): CompetitorStore {
  return {
    save: async (agencyId, clientId, metrics, brief) =>
      prisma.$transaction(async (tx) => {
        // Isolation in the predicate: the client must belong to the agency.
        const client = await tx.client.findFirst({
          where: { id: clientId, agencyId },
          select: { id: true },
        });
        if (!client) throw new NotFoundError("Client not found");
        // Aggregate brief on the client — what the planner reads.
        await tx.client.update({
          where: { id: clientId },
          data: { competitorBrief: brief as unknown as Prisma.InputJsonValue },
        });
        // Upsert each tracked competitor (no unique key on handle) and append an
        // insight snapshot capturing this sweep's metrics.
        for (const m of metrics) {
          const existing = await tx.competitor.findFirst({
            where: { clientId, platform: m.platform, handle: m.handle },
            select: { id: true },
          });
          const competitorId =
            existing?.id ??
            (
              await tx.competitor.create({
                data: { clientId, platform: m.platform, handle: m.handle, url: m.url },
                select: { id: true },
              })
            ).id;
          await tx.competitorInsight.create({
            data: {
              competitorId,
              metric: {
                engagementRate: m.engagementRate,
                postsPerWeek: m.postsPerWeek,
                avgViews: m.avgViews,
                topFormats: m.topFormats,
                sampleSize: m.sampleSize,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }),
    getBrief: async (agencyId, clientId): Promise<CompetitorBrief | null> => {
      const row = await prisma.client.findFirst({
        where: { id: clientId, agencyId },
        select: { competitorBrief: true },
      });
      if (!row || row.competitorBrief == null) return null;
      return row.competitorBrief as unknown as CompetitorBrief;
    },
  };
}

export function prismaTrendStore(prisma: PrismaClient): TrendStore {
  return {
    save: async (agencyId, clientId, signals, brief) =>
      prisma.$transaction(async (tx) => {
        // Isolation in the predicate: the client must belong to the agency.
        const client = await tx.client.findFirst({
          where: { id: clientId, agencyId },
          select: { id: true },
        });
        if (!client) throw new NotFoundError("Client not found");
        // Aggregate brief on the client — what the planner reads.
        await tx.client.update({
          where: { id: clientId },
          data: { trendBrief: brief as unknown as Prisma.InputJsonValue },
        });
        // Append a Trend row per ranked signal capturing this sweep's snapshot.
        for (const s of signals) {
          await tx.trend.create({
            data: {
              clientId,
              platform: s.platform,
              topic: s.topic,
              signal: {
                volume: s.volume,
                growth: s.growth,
                score: s.score,
                sampleRefs: s.sampleRefs,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }),
    getBrief: async (agencyId, clientId): Promise<TrendBrief | null> => {
      const row = await prisma.client.findFirst({
        where: { id: clientId, agencyId },
        select: { trendBrief: true },
      });
      if (!row || row.trendBrief == null) return null;
      return row.trendBrief as unknown as TrendBrief;
    },
  };
}

export function prismaAnalyticsStore(prisma: PrismaClient): AnalyticsStore {
  return {
    getPublishedPost: async (agencyId, publishJobId) => {
      // Scope through item → plan → client → agency; only a live post is readable.
      const job = await prisma.publishJob.findFirst({
        where: {
          id: publishJobId,
          state: "published",
          externalId: { not: null },
          contentItem: { plan: { client: { agencyId } } },
        },
        select: {
          id: true,
          platform: true,
          externalId: true,
          contentItem: { select: { plan: { select: { clientId: true } } } },
        },
      });
      if (!job?.externalId) return null;
      // A connected account on the same client + platform supplies the read token.
      const account = await prisma.connectedAccount.findFirst({
        where: {
          clientId: job.contentItem.plan.clientId,
          platform: job.platform,
          client: { agencyId },
        },
        select: { accessToken: true },
      });
      if (!account) return null;
      return {
        publishJobId: job.id,
        platform: job.platform as Platform,
        postExternalId: job.externalId,
        accessTokenEnc: account.accessToken,
      };
    },
    saveSnapshot: async (publishJobId, metrics: PostMetrics, capturedAt) => {
      await prisma.analyticsSnapshot.create({
        data: {
          publishJobId,
          metrics: metrics as unknown as Prisma.InputJsonValue,
          capturedAt,
        },
      });
    },
    listSnapshots: async (agencyId, publishJobId) => {
      const rows = await prisma.analyticsSnapshot.findMany({
        where: {
          publishJobId,
          publishJob: { contentItem: { plan: { client: { agencyId } } } },
        },
        orderBy: { capturedAt: "desc" },
        select: { metrics: true, capturedAt: true },
      });
      return rows.map((r) => ({
        metrics: (r.metrics ?? {}) as unknown as PostMetrics,
        capturedAt: r.capturedAt,
      }));
    },
  };
}

const TEAM_USER_SELECT = {
  id: true,
  agencyId: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export function prismaTeamStore(prisma: PrismaClient): TeamStore {
  return {
    listByAgency: (agencyId) =>
      prisma.user.findMany({
        where: { agencyId },
        orderBy: { createdAt: "desc" },
        select: TEAM_USER_SELECT,
      }),
    findInAgency: (agencyId, userId) =>
      prisma.user.findFirst({ where: { id: userId, agencyId }, select: TEAM_USER_SELECT }),
    countAdmins: (agencyId) =>
      prisma.user.count({ where: { agencyId, role: "agency_admin" } }),
    create: ({ agencyId, email, role, passwordHash }) =>
      prisma.user.create({
        data: { agencyId, email, role, passwordHash },
        select: TEAM_USER_SELECT,
      }),
    // Scoped write: the agencyId is part of the predicate, so a cross-tenant id
    // matches nothing (count 0 => null) — isolation lives in the write itself.
    setRole: async (agencyId, userId, role: Role) => {
      const res = await prisma.user.updateMany({ where: { id: userId, agencyId }, data: { role } });
      if (res.count === 0) return null;
      return prisma.user.findFirst({ where: { id: userId, agencyId }, select: TEAM_USER_SELECT });
    },
    remove: async (agencyId, userId) => {
      const res = await prisma.user.deleteMany({ where: { id: userId, agencyId } });
      return res.count > 0;
    },
  };
}

const SUBSCRIPTION_SELECT = {
  agencyId: true,
  plan: true,
  status: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  currentPeriodEnd: true,
} as const;

export function prismaBillingStore(prisma: PrismaClient): BillingStore {
  return {
    getByAgency: (agencyId) =>
      prisma.subscription.findUnique({ where: { agencyId }, select: SUBSCRIPTION_SELECT }),
    getByCustomerId: (customerId) =>
      prisma.subscription.findUnique({
        where: { stripeCustomerId: customerId },
        select: SUBSCRIPTION_SELECT,
      }),
    // The agency owns at most one subscription (unique agencyId), so upsert is the
    // natural create-or-update; the patch only touches the fields it carries.
    upsertByAgency: (agencyId, patch) =>
      prisma.subscription.upsert({
        where: { agencyId },
        create: { agencyId, ...patch },
        update: patch,
        select: SUBSCRIPTION_SELECT,
      }),
  };
}

const BRANDING_SELECT = {
  agencyId: true,
  brandName: true,
  logoUrl: true,
  primaryColor: true,
  supportEmail: true,
  customDomain: true,
} as const;

export function prismaBrandingStore(prisma: PrismaClient): BrandingStore {
  return {
    getByAgency: (agencyId) =>
      prisma.agencyBranding.findUnique({ where: { agencyId }, select: BRANDING_SELECT }),
    getByCustomDomain: (domain) =>
      prisma.agencyBranding.findUnique({ where: { customDomain: domain }, select: BRANDING_SELECT }),
    upsertByAgency: (agencyId, patch) =>
      prisma.agencyBranding.upsert({
        where: { agencyId },
        create: { agencyId, ...patch },
        update: patch,
        select: BRANDING_SELECT,
      }),
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
