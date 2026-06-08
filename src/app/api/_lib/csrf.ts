// CSRF defense for cookie-authenticated, state-changing routes. Layered with the
// SameSite=Lax session cookie. Browsers always attach Origin / Sec-Fetch-Site to
// cross-site mutating requests, so rejecting cross-origin here blocks CSRF while
// leaving legitimate same-origin and non-browser (no Origin) callers working.
import { ForbiddenError } from "@/lib/errors/app-error";
import { getEnv } from "@/lib/config/env";

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Throw ForbiddenError if a state-changing request comes from another origin. */
export function assertSameOrigin(
  req: Request,
  allowedBaseUrl: string = getEnv().APP_BASE_URL,
): void {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ForbiddenError("Cross-site request rejected");
  }

  const origin = req.headers.get("origin");
  if (!origin) return; // no Origin header → not a cross-site browser request
  const allowed = originOf(allowedBaseUrl);
  if (origin !== allowed) {
    throw new ForbiddenError("Cross-origin request rejected");
  }
}
