// Billing service — manages an agency's Stripe subscription: read the current
// plan, start a Checkout upgrade, and apply signed webhook events. Tenant-scoped
// reads/writes go through TenantContext; webhooks resolve their agency from the
// event metadata we set at checkout (they arrive with no session).
//
// AUDIT-EXEMPT: rule-based money/state plumbing, no LLM. The Subscription row +
// Stripe's own dashboard are the record of truth.
import { assertAgencyId, type TenantContext } from "@/lib/db/tenancy";
import { withDbErrors } from "@/lib/db/errors";
import { ValidationError } from "@/lib/errors/app-error";
import type {
  BillingPlan,
  BillingStore,
  StripeGateway,
  StripeWebhookEvent,
  SubscriptionRecord,
} from "./types";

export * from "./types";

/** Stripe price ids for the paid plans (from env). */
export interface PlanPrices {
  starter: string;
  pro: string;
}

export interface BillingServiceDeps {
  store: BillingStore;
  gateway: StripeGateway;
  prices: PlanPrices;
}

/** The view returned to the app — never leaks Stripe ids. */
export interface BillingStatus {
  plan: BillingPlan;
  status: SubscriptionRecord["status"];
  currentPeriodEnd: Date | null;
}

const FREE_STATUS: BillingStatus = { plan: "free", status: "active", currentPeriodEnd: null };

export class BillingService {
  constructor(private readonly deps: BillingServiceDeps) {}

  private priceFor(plan: BillingPlan): string {
    if (plan === "starter") return this.deps.prices.starter;
    if (plan === "pro") return this.deps.prices.pro;
    throw new ValidationError("free is the default plan — no checkout required");
  }

  private planForPrice(priceId: string | undefined): BillingPlan | undefined {
    if (!priceId) return undefined;
    if (priceId === this.deps.prices.starter) return "starter";
    if (priceId === this.deps.prices.pro) return "pro";
    return undefined;
  }

  /** Current plan + status for the calling agency. Absent row == free. */
  async getStatus(ctx: TenantContext): Promise<BillingStatus> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const sub = await withDbErrors(() => this.deps.store.getByAgency(agencyId), "Subscription");
    if (!sub) return FREE_STATUS;
    return { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd };
  }

  /**
   * Start a Stripe Checkout for a paid plan. Reuses the agency's Stripe customer
   * (creating + persisting one on first upgrade) and returns the hosted URL.
   */
  async startCheckout(
    ctx: TenantContext,
    plan: BillingPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ url: string }> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const priceId = this.priceFor(plan); // throws on "free"

    const existing = await withDbErrors(
      () => this.deps.store.getByAgency(agencyId),
      "Subscription",
    );
    let customerId = existing?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await this.deps.gateway.createCustomer({ agencyId });
      customerId = customer.id;
      await withDbErrors(
        () => this.deps.store.upsertByAgency(agencyId, { stripeCustomerId: customerId }),
        "Subscription",
      );
    }

    const session = await this.deps.gateway.createCheckoutSession({
      agencyId,
      customerId,
      priceId,
      successUrl,
      cancelUrl,
    });
    return { url: session.url };
  }

  /**
   * Verify + apply a raw Stripe webhook. The gateway checks the signature (throws
   * 403 on mismatch) and normalizes the event before applyWebhook translates it.
   */
  async handleWebhook(rawBody: string, signature: string | null): Promise<void> {
    const event = this.deps.gateway.parseWebhookEvent(rawBody, signature);
    await this.applyWebhook(event);
  }

  /**
   * Apply an already-verified webhook event. Translates the event into a
   * subscription state change; events we don't model are no-ops (idempotent).
   */
  async applyWebhook(event: StripeWebhookEvent): Promise<void> {
    const agencyId = await this.resolveAgencyId(event);
    if (!agencyId) return; // can't attribute — ack without changing state

    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const patch: Parameters<BillingStore["upsertByAgency"]>[1] = {
          status: event.status ?? "active",
        };
        const plan = this.planForPrice(event.priceId);
        if (plan) patch.plan = plan;
        if (event.subscriptionId) patch.stripeSubscriptionId = event.subscriptionId;
        if (event.customerId) patch.stripeCustomerId = event.customerId;
        if (event.currentPeriodEnd) patch.currentPeriodEnd = event.currentPeriodEnd;
        await withDbErrors(() => this.deps.store.upsertByAgency(agencyId, patch), "Subscription");
        return;
      }
      case "customer.subscription.deleted": {
        // Subscription ended — drop the agency back to the free plan.
        await withDbErrors(
          () =>
            this.deps.store.upsertByAgency(agencyId, {
              plan: "free",
              status: "canceled",
              stripeSubscriptionId: null,
              currentPeriodEnd: null,
            }),
          "Subscription",
        );
        return;
      }
      default:
        return; // unmodeled event — no-op
    }
  }

  /** agencyId from event metadata, else a lookup by Stripe customer id. */
  private async resolveAgencyId(event: StripeWebhookEvent): Promise<string | undefined> {
    if (event.agencyId) return event.agencyId;
    if (event.customerId) {
      const sub = await withDbErrors(
        () => this.deps.store.getByCustomerId(event.customerId!),
        "Subscription",
      );
      return sub?.agencyId;
    }
    return undefined;
  }
}

/** Guard for plan param coming from a request — rejects unknown/free-checkout. */
export function assertCheckoutPlan(value: unknown): "starter" | "pro" {
  if (value === "starter" || value === "pro") return value;
  throw new ValidationError("Plan must be 'starter' or 'pro'");
}
