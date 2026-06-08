import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { researchLimiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { ClientRepository } from "@/lib/repositories/client-repository";
import {
  prismaClientStore,
  prismaResearchBriefStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { assertPublicUrl } from "@/lib/brand-intel/url-guard";
import { ResearchService } from "@/lib/research";
import { enqueueResearch } from "@/lib/queue/research-queue";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

function service() {
  const prisma = getPrisma();
  return new ResearchService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    store: prismaResearchBriefStore(prisma),
    clients: new ClientRepository(prismaClientStore(prisma)),
    fetchUrl: async (url) => {
      await assertPublicUrl(url);
      const res = await fetch(url, {
        headers: { "User-Agent": "firstwave-research/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      return res.text();
    },
  });
}

const BodySchema = z.object({
  seedUrls: z.array(z.string().url()).max(3).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const brief = await service().getBrief(auth.ctx, params.id);
    if (!brief) throw new NotFoundError("No research brief found for this client");
    return ok({ brief });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(researchLimiter, `research:${auth.ctx.agencyId}:${params.id}`);

    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    // Ownership pre-flight: fail fast rather than queuing a job for a foreign client.
    const prisma = getPrisma();
    await new ClientRepository(prismaClientStore(prisma)).get(auth.ctx, params.id);

    const jobId = await enqueueResearch({
      agencyId: auth.ctx.agencyId,
      clientId: params.id,
      seedUrls: body.data.seedUrls,
    });

    return ok({ jobId, status: "queued" }, 202);
  });
}
