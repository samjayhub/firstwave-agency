import { handle, ok } from "@/app/api/_lib/respond";
import { approvalService, notificationService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    const item = await approvalService().submit(auth.ctx, params.id);
    // Alert operators that an item is waiting on a review decision (P4-06).
    await notificationService().emit({
      agencyId: auth.ctx.agencyId,
      kind: "approval_requested",
      title: "Content awaiting review",
      body: `An item is ready for review (item ${item.id}).`,
    });
    return ok({ item });
  });
}
