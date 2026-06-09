// Outbound webhooks (P4-08). Agencies subscribe endpoints to events; the app
// signs each delivery with an HMAC-SHA256 of the body (per-webhook secret) so the
// receiver can verify authenticity. Delivery is best-effort and tolerant: one
// endpoint failing never blocks the others or the originating job.
//
// AUDIT-EXEMPT: rule-based dispatch; the Webhook rows + receiver logs are the trail.
import { createHmac, randomBytes } from "node:crypto";
import type { TenantContext } from "@/lib/db/tenancy";
import { NotFoundError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";

export const WEBHOOK_EVENTS = [
  "publish.succeeded",
  "publish.failed",
  "metric.snapshot",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookRow {
  id: string;
  agencyId: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: Date;
}

export type WebhookSummary = Omit<WebhookRow, "agencyId">;
/** Returned once at creation — includes the signing secret. */
export interface CreatedWebhook extends WebhookSummary {
  secret: string;
}

/** A webhook resolved for delivery (includes its secret for signing). */
export interface DeliverableWebhook {
  id: string;
  url: string;
  secret: string;
}

export interface WebhookStore {
  create(
    agencyId: string,
    data: { url: string; secret: string; events: WebhookEvent[] },
  ): Promise<WebhookRow>;
  list(agencyId: string): Promise<WebhookRow[]>;
  remove(agencyId: string, id: string): Promise<boolean>;
  /** Active webhooks for an agency subscribed to `event`. */
  deliverablesFor(agencyId: string, event: WebhookEvent): Promise<DeliverableWebhook[]>;
}

type FetchImpl = typeof fetch;

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export interface WebhookServiceDeps {
  store: WebhookStore;
  fetchImpl?: FetchImpl;
  randomHex?: (bytes: number) => string;
  clock?: () => Date;
}

function toSummary(row: WebhookRow): WebhookSummary {
  const { agencyId: _agencyId, ...rest } = row;
  return rest;
}

export class WebhookService {
  private readonly fetchImpl: FetchImpl;
  private readonly randomHex: (bytes: number) => string;
  private readonly clock: () => Date;

  constructor(private readonly deps: WebhookServiceDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.randomHex = deps.randomHex ?? ((bytes) => randomBytes(bytes).toString("hex"));
    this.clock = deps.clock ?? (() => new Date());
  }

  async create(
    ctx: TenantContext,
    input: { url: string; events: WebhookEvent[] },
  ): Promise<CreatedWebhook> {
    const secret = `whsec_${this.randomHex(24)}`;
    const row = await this.deps.store.create(ctx.agencyId, {
      url: input.url,
      secret,
      events: input.events,
    });
    return { ...toSummary(row), secret };
  }

  async list(ctx: TenantContext): Promise<WebhookSummary[]> {
    const rows = await this.deps.store.list(ctx.agencyId);
    return rows.map(toSummary);
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const ok = await this.deps.store.remove(ctx.agencyId, id);
    if (!ok) throw new NotFoundError("Webhook not found");
  }

  /**
   * Deliver an event to every subscribed endpoint. Best-effort: each POST is
   * independent and a failure is logged, never thrown. Returns how many succeeded.
   */
  async dispatch(
    agencyId: string,
    event: WebhookEvent,
    data: Record<string, unknown>,
  ): Promise<{ delivered: number }> {
    const targets = await this.deps.store.deliverablesFor(agencyId, event);
    if (targets.length === 0) return { delivered: 0 };

    const body = JSON.stringify({ event, data, sentAt: this.clock().toISOString() });
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const res = await this.fetchImpl(target.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-firstwave-event": event,
            "x-firstwave-signature": signPayload(target.secret, body),
          },
          body,
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
      }),
    );

    let delivered = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") delivered += 1;
      else
        logger.warn("webhook delivery failed", {
          webhookId: targets[i]!.id,
          event,
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
    });
    return { delivered };
  }
}
