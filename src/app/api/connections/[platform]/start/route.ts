import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail } from "@/app/api/_lib/respond";
import { connectionService, requireRequestAuth } from "@/app/api/_lib/deps";
import { requireEnv } from "@/lib/config/env";
import { ValidationError } from "@/lib/errors/app-error";
import type { Platform } from "@/lib/publishers/types";

export const runtime = "nodejs";

const SUPPORTED = new Set<Platform>(["linkedin", "meta_fb", "meta_ig", "youtube", "tiktok"]);

/** Per-platform OAuth redirect URI env var. */
function redirectUriFor(platform: Platform): string {
  if (platform === "meta_fb" || platform === "meta_ig") {
    return requireEnv("META_REDIRECT_URI");
  }
  if (platform === "youtube") return requireEnv("YOUTUBE_REDIRECT_URI");
  if (platform === "tiktok") return requireEnv("TIKTOK_REDIRECT_URI");
  return requireEnv("LINKEDIN_REDIRECT_URI");
}

export async function GET(req: Request, { params }: { params: { platform: string } }) {
  try {
    const auth = requireRequestAuth();
    const platform = params.platform as Platform;
    if (!SUPPORTED.has(platform)) throw new ValidationError("Unsupported platform");

    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) throw new ValidationError("clientId is required");

    const redirectUri = redirectUriFor(platform);
    const nonce = randomUUID();
    // State carries the (clientId, platform) + a nonce echoed in an HttpOnly cookie
    // (double-submit) so the callback can verify it wasn't forged.
    const state = Buffer.from(
      JSON.stringify({ clientId, platform, nonce, agencyId: auth.ctx.agencyId }),
    ).toString("base64url");

    const res = NextResponse.redirect(connectionService().authorizeUrl(platform, redirectUri, state));
    res.cookies.set({
      name: "oauth_state",
      value: nonce,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    return fail(err);
  }
}
