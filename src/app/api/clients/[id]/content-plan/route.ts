import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { contentPlanLimiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { ClientRepository } from "@/lib/repositories/client-repository";
import {
  prismaBrandProfileStore,
  prismaClientStore,
  prismaContentPlanStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { ContentPlannerService } from "@/lib/planner";
import { ValidationError } from "@/lib/errors/app-error";
import type { Platform } from "@/lib/publishers/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function planner() {
  const prisma = getPrisma();
  return new ContentPlannerService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    clients: new ClientRepository(prismaClientStore(prisma)),
    brandProfiles: prismaBrandProfileStore(prisma),
    plans: prismaContentPlanStore(prisma),
  });
}

const BodySchema = z.object({
  days: z.number().int().min(1).max(60).optional(),
  platforms: z.array(z.string()).max(6).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const plan = await planner().latest(auth.ctx, params.id);
    return ok({ plan });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(contentPlanLimiter, `plan:${auth.ctx.agencyId}:${params.id}`);
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    const result = await planner().generate(auth.ctx, {
      clientId: params.id,
      ...(body.data.days !== undefined ? { days: body.data.days } : {}),
      ...(body.data.platforms ? { platforms: body.data.platforms as Platform[] } : {}),
    });
    return ok({ plan: result }, 201);
  });
}
