import { handle, ok } from "@/app/api/_lib/respond";
import { schedulerService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, schedulerTickLimiter } from "@/app/api/_lib/rate-limit";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Manual ops trigger for the scheduling engine (P4-01). The normal path is the
// worker's repeatable heartbeat; this lets an admin fire a tick on demand,
// scoped to their OWN agency's due items (the cron tick runs across all).
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    await enforceLimit(schedulerTickLimiter, `scheduler-tick:${auth.ctx.agencyId}`);

    const result = await schedulerService().tick({ agencyId: auth.ctx.agencyId });
    return ok(result);
  });
}
