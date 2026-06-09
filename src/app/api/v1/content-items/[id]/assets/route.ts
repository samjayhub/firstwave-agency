import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { assetRepository } from "@/app/api/_lib/deps";
import { requireApiAuth } from "@/app/api/_lib/api-auth";
import { apiV1Limiter, enforceLimit } from "@/app/api/_lib/rate-limit";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Public API (P4-08): push an externally-produced asset onto a content item.
// Ownership is enforced in the repository's create predicate (item must belong
// to the key's agency). No CSRF — bearer-token auth, not a browser session.
const BodySchema = z.object({
  url: z.string().url(),
  kind: z.enum(["image", "video"]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const ctx = await requireApiAuth(req);
    await enforceLimit(apiV1Limiter, `api:${ctx.agencyId}`);
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError(body.error.issues[0]?.message);

    const asset = await assetRepository().create(ctx.agencyId, {
      contentItemId: params.id,
      kind: body.data.kind,
      url: body.data.url,
      source: "upload",
    });
    return ok({ asset }, 201);
  });
}
