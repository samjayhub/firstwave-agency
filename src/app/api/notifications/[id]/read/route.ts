import { handle, ok } from "@/app/api/_lib/respond";
import { notificationService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { NotFoundError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Mark one notification read (P4-06).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const ok_ = await notificationService().markRead(auth.ctx, params.id);
    if (!ok_) throw new NotFoundError("Notification not found");
    return ok({ read: true });
  });
}
