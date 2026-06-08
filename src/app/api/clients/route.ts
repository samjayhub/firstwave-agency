import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { clientRepository, requireRequestAuth } from "@/app/api/_lib/deps";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1).max(160),
  websiteUrl: z.string().url().nullish(),
  niche: z.string().max(160).nullish(),
});

export async function GET(req: Request) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const page = await clientRepository().list(auth.ctx, { cursor, limit });
    return ok(page);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = requireRequestAuth();
    const parsed = CreateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    const created = await clientRepository().create(auth.ctx, parsed.data);
    return ok({ client: created }, 201);
  });
}
