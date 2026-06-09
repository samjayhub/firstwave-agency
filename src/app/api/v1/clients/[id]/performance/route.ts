import { handle, ok } from "@/app/api/_lib/respond";
import { performanceService } from "@/app/api/_lib/deps";
import { requireApiAuth } from "@/app/api/_lib/api-auth";
import { apiV1Limiter, enforceLimit } from "@/app/api/_lib/rate-limit";

export const runtime = "nodejs";

// Public API (P4-08): the client's performance brief (null until measured).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const ctx = await requireApiAuth(req);
    await enforceLimit(apiV1Limiter, `api:${ctx.agencyId}`);
    const performance = await performanceService().brief(ctx, params.id);
    return ok({ performance });
  });
}
