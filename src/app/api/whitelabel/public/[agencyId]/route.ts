import { handle, ok } from "@/app/api/_lib/respond";
import { whiteLabelService } from "@/app/api/_lib/deps";

export const runtime = "nodejs";

/**
 * Display-safe branding for a client-facing surface (the shareable reviewer view)
 * to theme itself. Intentionally UNAUTHENTICATED and read-only: it returns only
 * brandName / logoUrl / primaryColor — never the support email, domain, or any
 * tenant data — so exposing it by agency id leaks nothing sensitive.
 */
export async function GET(_req: Request, { params }: { params: { agencyId: string } }) {
  return handle(async () => {
    const branding = await whiteLabelService().resolvePublic(params.agencyId);
    return ok({ branding });
  });
}
