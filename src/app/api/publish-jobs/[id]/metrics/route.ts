import { handle, ok } from "@/app/api/_lib/respond";
import { analyticsService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { analyticsLimiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { prismaAnalyticsStore } from "@/lib/repositories/prisma-stores";
import { enqueueFetchMetrics } from "@/lib/queue/fetch-metrics-queue";
import { NotFoundError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const snapshots = await analyticsService().list(auth.ctx, params.id);
    return ok({ snapshots });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(analyticsLimiter, `analytics:${auth.ctx.agencyId}:${params.id}`);

    // Ownership pre-flight: only queue a refresh for a published post this agency
    // owns and can actually read (a connected account exists on its platform).
    const post = await prismaAnalyticsStore(getPrisma()).getPublishedPost(
      auth.ctx.agencyId,
      params.id,
    );
    if (!post) throw new NotFoundError("No published post found for this job");

    const jobId = await enqueueFetchMetrics({
      agencyId: auth.ctx.agencyId,
      publishJobId: params.id,
    });

    return ok({ jobId, status: "queued" }, 202);
  });
}
