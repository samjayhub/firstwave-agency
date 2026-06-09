import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { mediaLibraryService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Asset lifecycle (P4-10): soft-archive or restore one library asset.
const PatchSchema = z.object({ archived: z.boolean() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const body = PatchSchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);
    await mediaLibraryService().setArchived(auth.ctx, params.id, body.data.archived);
    return ok({ id: params.id, archived: body.data.archived });
  });
}
