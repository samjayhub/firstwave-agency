import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { authService } from "@/app/api/_lib/deps";
import { sessionCookie } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors/app-error";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const runtime = "nodejs";

const SignupSchema = z.object({
  agencyName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = SignupSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const { token, user } = await authService().signup(parsed.data);
    const res = ok({ user }, 201);
    res.cookies.set(sessionCookie(token));
    return res;
  });
}
