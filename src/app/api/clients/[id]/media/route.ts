import { handle, ok } from "@/app/api/_lib/respond";
import { mediaLibraryService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireRole } from "@/lib/auth/guard";

export const runtime = "nodejs";

// Browse a client's media library (P4-10): every asset across the client's
// items, newest first. Filter by ?kind=, ?source=, ?includeArchived=1.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireRequestAuth();
    requireRole(auth, "agency_admin", "strategist");
    const url = new URL(req.url);
    const assets = await mediaLibraryService().list(auth.ctx, params.id, {
      ...(url.searchParams.get("kind") ? { kind: url.searchParams.get("kind")! } : {}),
      ...(url.searchParams.get("source") ? { source: url.searchParams.get("source")! } : {}),
      includeArchived: url.searchParams.get("includeArchived") === "1",
    });
    return ok({ assets });
  });
}
