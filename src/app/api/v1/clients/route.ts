import { handle, ok } from "@/app/api/_lib/respond";
import { clientRepository } from "@/app/api/_lib/deps";
import { requireApiAuth } from "@/app/api/_lib/api-auth";
import { apiV1Limiter, enforceLimit } from "@/app/api/_lib/rate-limit";

export const runtime = "nodejs";

// Public API (P4-08): list the agency's clients. Bearer-key authenticated.
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireApiAuth(req);
    await enforceLimit(apiV1Limiter, `api:${ctx.agencyId}`);
    const page = await clientRepository().list(ctx, { limit: 100 });
    return ok({ clients: page.items, nextCursor: page.nextCursor });
  });
}
