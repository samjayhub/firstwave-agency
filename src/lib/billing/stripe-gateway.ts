// Stripe gateway — talks to the Stripe REST API over fetch (no SDK, matching the
// publisher adapters) and verifies webhook signatures with node crypto. Customer
// + Checkout Session creation are the only writes; everything else flows in via
// signed webhooks. The fetch + clock are injectable for tests, and a Fake gateway
// lets the BillingService run fully offline.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ExternalServiceError, ForbiddenError } from "@/lib/errors/app-error";
import type {
  CreateCheckoutInput,
  CreateCustomerInput,
  StripeGateway,
  StripeWebhookEvent,
  SubscriptionStatus,
} from "./types";

const API_BASE = "https://api.stripe.com/v1";
// Reject webhooks whose signed timestamp is older than this (replay defense).
const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

const STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
]);

export interface StripeGatewayConfig {
  secretKey: string;
  webhookSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** Stripe encodes nested params as form keys like `metadata[agencyId]`. */
function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export class HttpStripeGateway implements StripeGateway {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: StripeGatewayConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  private async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const res = await this.fetchFn(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new ExternalServiceError(`Stripe API error (${res.status})`);
    return (await res.json()) as T;
  }

  async createCustomer({ agencyId, name, email }: CreateCustomerInput): Promise<{ id: string }> {
    const out = await this.post<{ id?: string }>("/customers", {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      "metadata[agencyId]": agencyId,
    });
    if (!out.id) throw new ExternalServiceError("Stripe returned no customer id");
    return { id: out.id };
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }> {
    const out = await this.post<{ id?: string; url?: string }>("/checkout/sessions", {
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: input.agencyId,
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][agencyId]": input.agencyId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!out.id || !out.url) throw new ExternalServiceError("Stripe returned no checkout url");
    return { id: out.id, url: out.url };
  }

  /** Verify `t=...,v1=...` against HMAC-SHA256 of `${t}.${payload}`. */
  parseWebhookEvent(rawBody: string, signature: string | null): StripeWebhookEvent {
    if (!signature) throw new ForbiddenError("Missing Stripe signature");
    const parts = Object.fromEntries(
      signature.split(",").map((kv) => {
        const [k, v] = kv.split("=");
        return [k, v ?? ""];
      }),
    );
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) throw new ForbiddenError("Malformed Stripe signature");

    const ageMs = this.now() - Number(t) * 1000;
    if (!Number.isFinite(ageMs) || Math.abs(ageMs) > SIGNATURE_TOLERANCE_MS) {
      throw new ForbiddenError("Stripe signature timestamp outside tolerance");
    }

    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenError("Stripe signature mismatch");
    }

    let event: { type?: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new ForbiddenError("Malformed Stripe event body");
    }
    return normalizeEvent(event);
  }
}

/** Pull the fields the BillingService needs out of a raw Stripe event object. */
function normalizeEvent(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}): StripeWebhookEvent {
  const type = event.type ?? "";
  const obj = (event.data?.object ?? {}) as Record<string, any>;
  const metadataAgencyId =
    (obj.metadata?.agencyId as string | undefined) ??
    (obj.client_reference_id as string | undefined);

  const rawStatus = obj.status as string | undefined;
  const status = rawStatus && STATUSES.has(rawStatus) ? (rawStatus as SubscriptionStatus) : undefined;

  // checkout.session carries `subscription`; a subscription object IS the id.
  const subscriptionId =
    type.startsWith("customer.subscription")
      ? (obj.id as string | undefined)
      : (obj.subscription as string | undefined);

  const priceId = obj.items?.data?.[0]?.price?.id as string | undefined;
  const periodEnd = obj.current_period_end as number | undefined;

  return {
    type,
    ...(metadataAgencyId ? { agencyId: metadataAgencyId } : {}),
    ...(obj.customer ? { customerId: obj.customer as string } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
    ...(status ? { status } : {}),
    ...(priceId ? { priceId } : {}),
    ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
  };
}

/** Offline gateway for dev/test: deterministic ids, no signature checking. */
export class FakeStripeGateway implements StripeGateway {
  public events: StripeWebhookEvent[] = [];
  private seq = 0;

  async createCustomer({ agencyId }: CreateCustomerInput): Promise<{ id: string }> {
    return { id: `cus_fake_${agencyId}` };
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }> {
    const id = `cs_fake_${++this.seq}`;
    return { id, url: `https://checkout.stripe.test/${id}` };
  }

  // Tests push normalized events directly; this just dequeues them in order.
  parseWebhookEvent(): StripeWebhookEvent {
    const next = this.events.shift();
    if (!next) throw new ExternalServiceError("FakeStripeGateway: no queued event");
    return next;
  }
}
