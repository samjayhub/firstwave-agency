import { handle, ok } from "@/app/api/_lib/respond";
import { billingService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

/** Current plan + status for the calling agency. Visible to admins + strategists. */
export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const status = await billingService().getStatus(auth.ctx);
    return ok({ billing: status });
  });
}
