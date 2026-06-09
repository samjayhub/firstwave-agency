import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { reportService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, reportSendLimiter } from "@/app/api/_lib/rate-limit";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Client performance report (P4-07). GET returns the data; POST emails it.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const days = Number(new URL(req.url).searchParams.get("sinceDays")) || undefined;
    const report = await reportService().build(auth.ctx, params.id, days);
    return ok({ report });
  });
}

const SendSchema = z.object({
  to: z.string().email().optional(),
  sinceDays: z.number().int().min(1).max(365).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    await enforceLimit(reportSendLimiter, `report-send:${auth.ctx.agencyId}:${params.id}`);
    const body = SendSchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);
    const result = await reportService().send(auth.ctx, params.id, {
      ...(body.data.to ? { to: body.data.to } : {}),
      ...(body.data.sinceDays ? { days: body.data.sinceDays } : {}),
    });
    return ok(result);
  });
}
