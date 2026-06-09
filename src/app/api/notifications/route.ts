import { handle, ok } from "@/app/api/_lib/respond";
import { notificationService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// The agency's in-app notification feed (P4-06). Visible to operators.
export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const notifications = await notificationService().list(auth.ctx);
    return ok({ notifications });
  });
}
