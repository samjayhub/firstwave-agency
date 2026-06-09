import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, videoGenLimiter } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import {
  prismaAssetRepository,
  prismaBrandProfileStore,
  prismaContentItemStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getAssetStorage } from "@/lib/creative";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import {
  VideoStudioService,
  getBrollProvider,
  getTtsProvider,
  getVideoAssembler,
} from "@/lib/video";
import { enqueueVideo } from "@/lib/queue/video-queue";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

function studio() {
  const prisma = getPrisma();
  return new VideoStudioService({
    llm: getLlmProvider(),
    model: DEFAULT_LLM_MODEL,
    tts: getTtsProvider(),
    broll: getBrollProvider(),
    assembler: getVideoAssembler(),
    storage: getAssetStorage(),
    assets: prismaAssetRepository(prisma),
    items: prismaContentItemStore(prisma),
    brandProfiles: prismaBrandProfileStore(prisma),
    sink: new PrismaAuditSink(prisma),
  });
}

const BodySchema = z.object({
  painPoint: z.string().min(1).max(1000).optional(),
  targetSeconds: z.number().int().min(15).max(180).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const videos = await studio().listForItem(auth.ctx, params.id);
    return ok({ videos });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(videoGenLimiter, `video:${auth.ctx.agencyId}:${params.id}`);

    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    // Ownership pre-flight: fail fast rather than queuing a job for a foreign item.
    const item = await prismaContentItemStore(getPrisma()).findForAgency(
      auth.ctx.agencyId,
      params.id,
    );
    if (!item) throw new NotFoundError("Content item not found");

    const jobId = await enqueueVideo({
      agencyId: auth.ctx.agencyId,
      itemId: params.id,
      painPoint: body.data.painPoint,
      targetSeconds: body.data.targetSeconds,
    });

    return ok({ jobId, status: "queued" }, 202);
  });
}
