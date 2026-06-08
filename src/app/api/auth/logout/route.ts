import { handle, ok } from "@/app/api/_lib/respond";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { clearedSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const res = ok({ ok: true });
    res.cookies.set(clearedSessionCookie());
    return res;
  });
}
