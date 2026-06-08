import { handle, ok } from "@/app/api/_lib/respond";
import { approvalService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    const item = await approvalService().reject(auth.ctx, params.id);
    return ok({ item });
  });
}
