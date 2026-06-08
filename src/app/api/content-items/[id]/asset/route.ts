import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, imageGenLimiter } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import {
  prismaAssetRepository,
  prismaBrandProfileStore,
  prismaContentItemStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import {
  CreativeStudioService,
  getAssetStorage,
  getCreativeProvider,
} from "@/lib/creative";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";
export const maxDuration = 60;

function studio() {
  const prisma = getPrisma();
  return new CreativeStudioService({
    provider: getCreativeProvider(),
    storage: getAssetStorage(),
    assets: prismaAssetRepository(prisma),
    items: prismaContentItemStore(prisma),
    brandProfiles: prismaBrandProfileStore(prisma),
    sink: new PrismaAuditSink(prisma),
  });
}

const BodySchema = z.object({ prompt: z.string().min(1).max(1000).optional() });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const assets = await studio().listForItem(auth.ctx, params.id);
    return ok({ assets });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(imageGenLimiter, `image:${auth.ctx.agencyId}:${params.id}`);
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    const asset = await studio().generateImage(auth.ctx, params.id, body.data.prompt);
    return ok({ asset }, 201);
  });
}
