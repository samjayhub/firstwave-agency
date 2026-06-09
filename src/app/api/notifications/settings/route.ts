import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { notificationService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";
import { NOTIFICATION_KINDS } from "@/lib/notifications/types";

export const runtime = "nodejs";

// Per-agency notification delivery settings (P4-06). Admin-managed.
const PatchSchema = z.object({
  slackWebhookUrl: z.string().url().nullable().optional(),
  emailTo: z.string().email().nullable().optional(),
  mutedKinds: z.array(z.enum(NOTIFICATION_KINDS as [string, ...string[]])).optional(),
});

export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const settings = await notificationService().getSettings(auth.ctx);
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
    const settings = await notificationService().updateSettings(
      auth.ctx,
      parsed.data as Parameters<ReturnType<typeof notificationService>["updateSettings"]>[1],
    );
    return ok({ settings });
  });
}
