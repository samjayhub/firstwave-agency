import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import {
  approvalService,
  connectedAccountsRepository,
  requireRequestAuth,
} from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { enqueuePublish } from "@/lib/queue/publish-queue";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const BodySchema = z.object({ connectedAccountId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    const body = BodySchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError("connectedAccountId is required");

    // The account must belong to the caller's agency.
    const account = await connectedAccountsRepository().getForAgency(
      auth.ctx.agencyId,
      body.data.connectedAccountId,
    );
    if (!account) throw new NotFoundError("Connected account not found");

    // Human-approval gate: approved → scheduled (throws ConflictError otherwise).
    await approvalService().schedule(auth.ctx, params.id);

    const jobId = await enqueuePublish({
      agencyId: auth.ctx.agencyId,
      itemId: params.id,
      connectedAccountId: body.data.connectedAccountId,
    });
    return ok({ status: "scheduled", jobId }, 202);
  });
}
