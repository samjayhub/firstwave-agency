import { handle, ok } from "@/app/api/_lib/respond";
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { designLimiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import {
  prismaBrandProfileStore,
  prismaDesignItemStore,
} from "@/lib/repositories/prisma-stores";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { DesignDirectorService } from "@/lib/design";

export const runtime = "nodejs";

function designDirector() {
  const prisma = getPrisma();
  return new DesignDirectorService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    items: prismaDesignItemStore(prisma),
    brandProfiles: prismaBrandProfileStore(prisma),
  });
}

/** Run the specialist-agents design path for a content item. Returns the spec. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    await enforceLimit(designLimiter, `design:${auth.ctx.agencyId}:${params.id}`);
    const spec = await designDirector().design(auth.ctx, params.id);
    return ok({ design: spec }, 201);
  });
}
