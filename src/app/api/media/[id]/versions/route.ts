import { handle, ok } from "@/app/api/_lib/respond";
import { mediaLibraryService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Every version of an asset's group (P4-10) — the original plus each reuse,
// oldest first. A standalone asset returns just itself.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const versions = await mediaLibraryService().versions(auth.ctx, params.id);
    return ok({ versions });
  });
}
