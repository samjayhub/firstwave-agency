import { handle, ok } from "@/app/api/_lib/respond";
import { complianceService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Preview the compliance report for one item (P4-09) so an operator can see and
// fix violations before attempting approval. Read-only; the enforcing check runs
// inside the approve transition itself.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const report = await complianceService().evaluateItem(auth.ctx, params.id);
    return ok({ report });
  });
}
