import { z } from "zod";
import { handle, ok } from "@/app/api/_lib/respond";
import { approvalService, requireRequestAuth } from "@/app/api/_lib/deps";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const StatusSchema = z
  .enum(["draft", "in_review", "approved", "scheduled", "published", "failed"])
  .optional();

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const statusRaw = new URL(req.url).searchParams.get("status");
    const status = StatusSchema.safeParse(statusRaw === null ? undefined : statusRaw);
    if (!status.success) throw new ValidationError("invalid status filter");
    const items = await approvalService().list(auth.ctx, params.id, status.data);
    return ok({ items });
  });
}
