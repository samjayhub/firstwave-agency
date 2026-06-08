import { handle, ok } from "@/app/api/_lib/respond";
import { approvalService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    // Separation of duties: approval is a reviewer/admin action.
    requireRole(auth, "agency_admin", "client_reviewer");
    const item = await approvalService().approve(auth.ctx, params.id);
    return ok({ item });
  });
}
