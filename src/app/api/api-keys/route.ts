import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { apiKeyService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

// Manage public API keys (P4-08). Admin-only; the raw token is returned ONCE.
const MintSchema = z.object({ name: z.string().min(1).max(100) });

export async function GET() {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const keys = await apiKeyService().list(auth.ctx);
    return ok({ keys });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");
    const body = MintSchema.safeParse(await readJson(req));
    if (!body.success) throw new ValidationError("A key name is required");
    const key = await apiKeyService().mint(auth.ctx, body.data.name);
    return ok({ key }, 201);
  });
}
