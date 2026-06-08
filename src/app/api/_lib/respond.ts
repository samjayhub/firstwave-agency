// HTTP response helpers. All route handlers return JSON and route every error
// through toClientError, so raw/internal errors never reach the client. 5xx are
// logged (scrubbed) for diagnosis; 4xx are not noise-logged.
import { NextResponse } from "next/server";
import { toClientError } from "@/lib/errors/app-error";
import { logger, scrubSecrets } from "@/lib/logger";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(err: unknown): NextResponse {
  const clientError = toClientError(err);
  if (clientError.status >= 500) {
    logger.error("request_error", {
      message: scrubSecrets(err instanceof Error ? err.message : String(err)),
    });
  }
  return NextResponse.json(
    { error: { code: clientError.code, message: clientError.message } },
    { status: clientError.status },
  );
}

/** Wrap a handler body so any thrown AppError/Error becomes a safe JSON response. */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    return fail(err);
  }
}

/** Parse a JSON body, returning {} on empty/invalid so zod produces field errors. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
