import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { complianceService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Per-agency compliance gate configuration (P4-09). Admin-managed: the banned
// terms + disclosure policy that augment the built-in platform-policy rules.
const PatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    bannedTerms: z.array(z.string().trim().min(1).max(120)).max(500).optional(),
    requireDisclosure: z.boolean().optional(),
    disclosureTags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  })
  .strict();

export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const settings = await complianceService().getSettings(auth.ctx);
    return ok({ settings });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const parsed = PatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    const settings = await complianceService().updateSettings(auth.ctx, parsed.data);
    return ok({ settings });
  });
}
