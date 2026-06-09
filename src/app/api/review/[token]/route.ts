import { handle, ok } from "@/app/api/_lib/respond";
import { reviewService } from "@/app/api/_lib/deps";

export const runtime = "nodejs";

// Public reviewer portal payload (P4-04): resolved by the unguessable token in
// the URL — no session. Returns the client's in-review queue + agency branding.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  return handle(async () => {
    const portal = await reviewService().portal(params.token);
    return ok(portal);
  });
}
