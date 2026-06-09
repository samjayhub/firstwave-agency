// Report email senders (P4-07). The HTTP sender posts the rendered report to a
// generic JSON email endpoint (the same one P4-06 uses); the log sender is the
// dependency-free default that records the report would-be-sent without a config.
import { ExternalServiceError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import type { ReportSender } from "./types";

type FetchImpl = typeof fetch;

export interface HttpReportSenderOptions {
  endpoint: string;
  token?: string;
  fetchImpl?: FetchImpl;
}

/** POST { to, subject, html } to a transactional-email endpoint. */
export function httpReportSender(opts: HttpReportSenderOptions): ReportSender {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async ({ to, subject, html }) => {
    const res = await fetchImpl(opts.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: JSON.stringify({ to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new ExternalServiceError(`Report email endpoint error (${res.status})`);
  };
}

/** Fallback sender when no email endpoint is configured — logs, never sends. */
export const logReportSender: ReportSender = async ({ to, subject }) => {
  logger.info("report email (no endpoint configured; not sent)", { to, subject });
};
