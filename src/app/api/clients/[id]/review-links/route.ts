import { handle, ok } from "@/app/api/_lib/respond";
import { reviewService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enforceLimit, reviewLinkLimiter } from "@/app/api/_lib/rate-limit";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Manage shareable reviewer links for a client (P4-04). Visible to managers +
// strategists; reviewers never mint links.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const links = await reviewService().listLinks(auth.ctx, params.id);
    return ok({ links });
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    await enforceLimit(reviewLinkLimiter, `review-link:${auth.ctx.agencyId}:${params.id}`);
    const link = await reviewService().createLink(auth.ctx, params.id);
    return ok(link, 201);
  });
}
