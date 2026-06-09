import { handle, ok } from "@/app/api/_lib/respond";
import { performanceService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// The performance brief the learning loop (P4-02) feeds into the planner, exposed
// read-only so an operator can see what the next plan will learn from. Visible to
// managers (admins) and strategists, not client reviewers. Returns null when the
// client has no published+measured posts yet.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const brief = await performanceService().brief(auth.ctx, params.id);
    return ok({ performance: brief });
  });
}
