// External notification channels (P4-06). Both are thin HTTP POSTs with an
// injectable fetch — no SDKs. Slack posts to an incoming-webhook URL; email
// posts to a generic JSON email endpoint (e.g. a transactional-email function),
// keeping us provider-agnostic and dependency-free.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { NotificationEvent, Notifier } from "./types";

type FetchImpl = typeof fetch;

/** Slack incoming-webhook notifier. `target` is the webhook URL. */
export function slackNotifier(fetchImpl: FetchImpl = fetch): Notifier {
  return {
    channel: "slack",
    async send(webhookUrl, event: NotificationEvent) {
      const res = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `*${event.title}*\n${event.body}` }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new ExternalServiceError(`Slack webhook error (${res.status})`);
    },
  };
}

export interface HttpEmailOptions {
  /** JSON endpoint that accepts { to, subject, body } and sends the email. */
  endpoint: string;
  /** Optional bearer token for the endpoint. */
  token?: string;
  fetchImpl?: FetchImpl;
}

/** Email notifier over a generic HTTP send endpoint. `target` is the recipient. */
export function httpEmailNotifier(opts: HttpEmailOptions): Notifier {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    channel: "email",
    async send(to, event: NotificationEvent) {
      const res = await fetchImpl(opts.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
        body: JSON.stringify({ to, subject: event.title, body: event.body }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new ExternalServiceError(`Email endpoint error (${res.status})`);
    },
  };
}
