import { reportService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";
import { fail } from "@/app/api/_lib/respond";

export const runtime = "nodejs";

// The branded report as printable HTML (P4-07): open in a browser and Print → PDF.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const days = Number(new URL(req.url).searchParams.get("sinceDays")) || undefined;
    const html = await reportService().renderHtml(auth.ctx, params.id, days);
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return fail(err);
  }
}
