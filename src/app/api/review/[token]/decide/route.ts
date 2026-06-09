import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { reviewService } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, reviewDecisionLimiter } from "@/app/api/_lib/rate-limit";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// A reviewer's decision on one item (P4-04). Token-authenticated (no session);
// CSRF still applies since the portal page POSTs same-origin.
const BodySchema = z.object({
  itemId: z.string().min(1),
  decision: z.enum(["approve", "request_changes"]),
  comment: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: { token: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    await enforceLimit(reviewDecisionLimiter, `review-decide:${params.token}`);
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    const result = await reviewService().decide(
      params.token,
      body.data.itemId,
      body.data.decision,
      body.data.comment,
    );
    return ok(result);
  });
}
