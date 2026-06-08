// Session cookie helpers. The token is an HttpOnly, Secure, SameSite=Lax cookie
// so it is never readable by client JS and not sent cross-site. Reading uses
// next/headers and therefore only works inside a request scope (route handlers /
// server actions).
import { cookies } from "next/headers";
import { DEFAULT_TTL_SECONDS } from "./jwt";

export const SESSION_COOKIE = "sml_session";

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

const baseCookie = (value: string, maxAge: number): CookieSpec => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  // Secure in production; allow http on localhost during development.
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge,
});

export function sessionCookie(token: string, maxAge = DEFAULT_TTL_SECONDS): CookieSpec {
  return baseCookie(token, maxAge);
}

export function clearedSessionCookie(): CookieSpec {
  return baseCookie("", 0);
}

/** Read the raw session token from the request cookies (undefined if absent). */
export function readSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}
