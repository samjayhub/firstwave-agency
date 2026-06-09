import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { mediaLibraryService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Re-attach a past asset to another content item — the P4-10 headline: reuse a
// stored asset without regenerating it. Same-client only (enforced in service).
const BodySchema = z.object({ targetItemId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);
    const asset = await mediaLibraryService().reattach(auth.ctx, params.id, body.data.targetItemId);
    return ok({ asset }, 201);
  });
}
