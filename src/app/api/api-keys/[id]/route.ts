import { handle, ok } from "@/app/api/_lib/respond";
import { apiKeyService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Revoke a public API key (P4-08).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    await apiKeyService().revoke(auth.ctx, params.id);
    return ok({ revoked: true });
  });
}
