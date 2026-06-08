import { handle, ok } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { copyGenLimiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import {
  prismaBrandProfileStore,
  prismaContentItemStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { CopyEngineService } from "@/lib/copy";

export const runtime = "nodejs";

function copyEngine() {
  const prisma = getPrisma();
  return new CopyEngineService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    items: prismaContentItemStore(prisma),
    brandProfiles: prismaBrandProfileStore(prisma),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(copyGenLimiter, `copy:${auth.ctx.agencyId}:${params.id}`);
    const generated = await copyEngine().write(auth.ctx, params.id);
    return ok({ copy: generated }, 201);
  });
}
