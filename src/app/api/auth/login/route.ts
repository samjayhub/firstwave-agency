import { z } from "zod";
import { handle, ok, readJson } from "@/app/api/_lib/respond";
import { authService } from "@/app/api/_lib/deps";
import { sessionCookie } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = LoginSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError("email and password are required");

    const { token, user } = await authService().login(parsed.data);
    const res = ok({ user });
    res.cookies.set(sessionCookie(token));
    return res;
  });
}
