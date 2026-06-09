import { handle, ok } from "@/app/api/_lib/respond";
import { billingService } from "@/app/api/_lib/deps";

export const runtime = "nodejs";

/**
 * Stripe → us. NOT browser-authenticated: there's no session, cookie, or CSRF
 * check — authenticity comes entirely from the HMAC signature over the raw body,
 * verified inside the service. We must read the body as raw text (not parsed JSON)
 * so the bytes match what Stripe signed.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    await billingService().handleWebhook(rawBody, signature);
    return ok({ received: true });
  });
}
