import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { webhookService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";

export const runtime = "nodejs";

// Manage outbound webhooks (P4-08). Admin-only; the signing secret is shown ONCE.
const CreateSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const webhooks = await webhookService().list(auth.ctx);
    return ok({ webhooks });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const body = CreateSchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);
    const webhook = await webhookService().create(auth.ctx, body.data);
    return ok({ webhook }, 201);
  });
}
