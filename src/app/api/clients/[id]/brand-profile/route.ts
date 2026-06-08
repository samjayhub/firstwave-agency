import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { brandExtractLimiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { ClientRepository } from "@/lib/repositories/client-repository";
import {
  prismaBrandProfileStore,
  prismaClientStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { PlaywrightCrawler } from "@/lib/brand-intel/playwright-crawler";
import { BrandIntelligenceService } from "@/lib/brand-intel";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";
// Crawl + LLM is long-running; MVP runs it synchronously. Production should move
// this to the BullMQ brand-extract job (PR7 worker) and return a job id.
export const maxDuration = 60;

function service() {
  const prisma = getPrisma();
  return new BrandIntelligenceService({
    crawler: new PlaywrightCrawler(),
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    clients: new ClientRepository(prismaClientStore(prisma)),
    profiles: prismaBrandProfileStore(prisma),
  });
}

const BodySchema = z.object({
  websiteUrl: z.string().url().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const profile = await service().get(auth.ctx, params.id);
    if (!profile) throw new NotFoundError("Brand profile not found");
    return ok({ brandProfile: profile });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(brandExtractLimiter, `brand:${auth.ctx.agencyId}:${params.id}`);
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    const prisma = getPrisma();
    const client = await new ClientRepository(prismaClientStore(prisma)).get(auth.ctx, params.id);
    const websiteUrl = body.data.websiteUrl ?? client.websiteUrl ?? undefined;
    if (!websiteUrl) {
      throw new ValidationError("No websiteUrl provided and the client has none on file");
    }

    const data = await service().extract(auth.ctx, { clientId: params.id, websiteUrl });
    return ok({ brandProfile: data }, 201);
  });
}
