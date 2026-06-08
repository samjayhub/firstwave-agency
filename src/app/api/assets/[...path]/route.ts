// Tenant-checked streamer for locally-stored generated assets. The storage key
// is `${clientId}/${itemId}/${uuid}.png`; we re-verify the caller owns the item
// (via its agency) before serving the bytes — so even an unguessable URL can't
// be fetched cross-tenant. Swapped for signed S3/R2 URLs in a later phase.
import { requireRequestAuth } from "@/app/api/_lib/deps";
import { fail } from "@/app/api/_lib/respond";
import { getPrisma } from "@/lib/db/prisma";
import { prismaContentItemStore } from "@/lib/repositories/prisma-stores";
import { getAssetStorage } from "@/lib/creative";
import { NotFoundError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  try {
    const auth = requireRequestAuth();
    const segments = params.path;
    // key shape: clientId / itemId / file
    if (segments.length < 3) throw new NotFoundError("Asset not found");
    const itemId = segments[1]!;

    const item = await prismaContentItemStore(getPrisma()).findForAgency(auth.ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Asset not found");

    const object = await getAssetStorage().get(segments.join("/"));
    if (!object) throw new NotFoundError("Asset not found");

    return new Response(new Uint8Array(object.bytes), {
      status: 200,
      headers: { "content-type": object.contentType, "cache-control": "private, max-age=300" },
    });
  } catch (err) {
    return fail(err);
  }
}
