import { handle, ok } from "@/app/api/_lib/respond";
import { clearedSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  return handle(async () => {
    const res = ok({ ok: true });
    res.cookies.set(clearedSessionCookie());
    return res;
  });
}
