import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fail } from "@/app/api/_lib/respond";
import { connectionService, requireRequestAuth } from "@/app/api/_lib/deps";
import { getEnv, requireEnv } from "@/lib/config/env";
import { ForbiddenError, ValidationError } from "@/lib/errors/app-error";
import type { Platform } from "@/lib/publishers/types";

export const runtime = "nodejs";

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function GET(req: Request, { params }: { params: { platform: string } }) {
  try {
    const auth = requireRequestAuth();
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) throw new ValidationError("Missing code or state");

    let state: { clientId?: string; platform?: string; nonce?: string };
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    } catch {
      throw new ValidationError("Malformed state");
    }

    // CSRF: the nonce in state must match the HttpOnly cookie set at /start.
    const cookieNonce = cookies().get("oauth_state")?.value;
    if (!cookieNonce || !state.nonce || !constantTimeEqual(cookieNonce, state.nonce)) {
      throw new ForbiddenError("OAuth state mismatch");
    }
    if (!state.clientId || state.platform !== params.platform) {
      throw new ValidationError("State does not match callback");
    }

    const platform = params.platform as Platform;
    const redirectUri =
      platform === "meta_fb" || platform === "meta_ig"
        ? requireEnv("META_REDIRECT_URI")
        : requireEnv("LINKEDIN_REDIRECT_URI");
    // completeConnection.create verifies the client belongs to this agency.
    const { accountId } = await connectionService().completeConnection(
      auth.ctx,
      platform,
      state.clientId,
      code,
      redirectUri,
    );

    const res = NextResponse.redirect(
      new URL(`/?connected=${encodeURIComponent(accountId)}`, getEnv().APP_BASE_URL),
    );
    res.cookies.set({ name: "oauth_state", value: "", path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return fail(err);
  }
}
