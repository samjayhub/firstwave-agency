import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { mediaLibraryService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Retention stage two (P4-10): hard-delete a client's assets that have been
// archived for at least `archivedForDays`, reclaiming their storage. Admin-only.
const BodySchema = z.object({ archivedForDays: z.number().int().min(0).max(3650) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);
    const result = await mediaLibraryService().purgeArchived(
      auth.ctx,
      params.id,
      body.data.archivedForDays,
    );
    return ok(result);
  });
}
