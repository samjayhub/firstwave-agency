import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { teamService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, teamInviteLimiter } from "@/app/api/_lib/rate-limit";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";
import { ROLES } from "@/lib/auth/roles";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const runtime = "nodejs";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    // The roster is visible to managers (admins) and strategists, not reviewers.
    requireRole(auth, "agency_admin", "strategist");
    const members = await teamService().list(auth.ctx);
    return ok({ members });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    // Only admins manage the team.
    requireRole(auth, "agency_admin");
    await enforceLimit(teamInviteLimiter, `team-invite:${auth.ctx.agencyId}`);

    const parsed = InviteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const member = await teamService().invite(auth.ctx, parsed.data);
    return ok({ member }, 201);
  });
}
