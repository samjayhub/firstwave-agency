import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { teamService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";
import { ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";

const UpdateRoleSchema = z.object({ role: z.enum(ROLES) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");

    const parsed = UpdateRoleSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const member = await teamService().updateRole(auth.ctx, params.id, parsed.data.role);
    return ok({ member });
  });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");

    await teamService().remove(auth.ctx, auth.userId, params.id);
    return ok({ ok: true });
  });
}
