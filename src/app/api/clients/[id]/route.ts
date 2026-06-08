import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { clientRepository, requireRequestAuth } from "@/app/api/_lib/deps";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const UpdateSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    websiteUrl: z.string().url().nullish(),
    niche: z.string().max(160).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const client = await clientRepository().get(auth.ctx, params.id);
    return ok({ client });
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const parsed = UpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    const client = await clientRepository().update(auth.ctx, params.id, parsed.data);
    return ok({ client });
  });
}
