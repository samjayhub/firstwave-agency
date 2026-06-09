import { handle, ok } from "@/app/api/_lib/respond";
import { reviewService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Revoke a reviewer share link (P4-04). Agency-scoped inside the service.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    await reviewService().revokeLink(auth.ctx, params.id);
    return ok({ revoked: true });
  });
}
