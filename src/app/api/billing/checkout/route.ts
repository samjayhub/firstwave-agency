import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { billingService, requireRequestAuth } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { requireRole } from "@/lib/auth/guard";
import { getEnv } from "@/lib/config/env";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const CheckoutSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  // Optional caller-supplied return paths; default to the app base URL.
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/** Start a Stripe Checkout for a paid plan. Admin-only. Returns the hosted URL. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin");

    const parsed = CheckoutSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const base = getEnv().APP_BASE_URL;
    const { url } = await billingService().startCheckout(
      auth.ctx,
      parsed.data.plan,
      parsed.data.successUrl ?? `${base}/billing?status=success`,
      parsed.data.cancelUrl ?? `${base}/billing?status=cancelled`,
    );
    return ok({ url });
  });
}
