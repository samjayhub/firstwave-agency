import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { whiteLabelService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// `null` clears a field; omitting it leaves the field unchanged.
const nullableString = (schema: z.ZodString) => schema.nullish();

const UpdateSchema = z
  .object({
    brandName: nullableString(z.string().min(1).max(80)),
    logoUrl: nullableString(z.string().url().max(2048)),
    // Hex colour like #4F46E5 (3- or 6-digit).
    primaryColor: nullableString(z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)),
    supportEmail: nullableString(z.string().email().max(254)),
    customDomain: nullableString(
      z.string().regex(/^(?=.{1,253}$)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/i),
    ),
  })
  .strict();

/** Read the calling agency's branding. Visible to admins + strategists. */
export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const branding = await whiteLabelService().getSettings(auth.ctx);
    return ok({ branding });
  });
}

/** Update the calling agency's branding. Admin-only. */
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");

    const parsed = UpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("No branding fields to update");
    }

    const branding = await whiteLabelService().updateSettings(auth.ctx, parsed.data);
    return ok({ branding });
  });
}
