import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { mediaLibraryService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Retention sweep (P4-10): soft-archive a client's stale, reusable assets that
// aren't attached to an in-use (approved/scheduled/published) item. Admin-only.
const BodySchema = z.object({ olderThanDays: z.number().int().min(1).max(3650) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);
    const result = await mediaLibraryService().runRetention(
      auth.ctx,
      params.id,
      body.data.olderThanDays,
    );
    return ok(result);
  });
}
