import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { authService } from "@/app/api/_lib/deps";
import { assertSameOrigin } from "@/app/api/_lib/csrf";
import { clientIp, enforceLimit, loginLimiter } from "@/app/api/_lib/rate-limit";
import { sessionCookie } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    await enforceLimit(loginLimiter, `login:ip:${clientIp(req)}`);

    const parsed = LoginSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError("email and password are required");

    // Also limit per-email to slow targeted credential stuffing.
    await enforceLimit(loginLimiter, `login:email:${parsed.data.email.toLowerCase()}`);

    const { token, user } = await authService().login(parsed.data);
    const res = ok({ user });
    res.cookies.set(sessionCookie(token));
    return res;
  });
}
