// Billing — the persistence + payment-gateway boundaries for agency subscriptions.
// The service holds plan/upgrade logic and depends on these narrow interfaces (not
// Prisma or the Stripe SDK) so it is fully testable against fakes. Stripe is the
// only payment provider today; the gateway interface keeps it swappable.

/** Paid tiers. `free` is the implicit plan when no subscription row exists. */
export type BillingPlan = "free" | "starter" | "pro";

/** Mirrors Stripe's subscription.status (the subset we care about). */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface SubscriptionRecord {
  agencyId: string;
  plan: BillingPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
}

/** Fields a write may set; agencyId identifies the row (create-or-update). */
export interface SubscriptionPatch {
  plan?: BillingPlan;
  status?: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
}

export interface BillingStore {
  getByAgency(agencyId: string): Promise<SubscriptionRecord | null>;
  getByCustomerId(customerId: string): Promise<SubscriptionRecord | null>;
  /** Create the agency's subscription row if absent, else patch it. */
  upsertByAgency(agencyId: string, patch: SubscriptionPatch): Promise<SubscriptionRecord>;
}

// ── Stripe gateway boundary ────────────────────────────────

export interface CreateCustomerInput {
  agencyId: string;
  name?: string;
  email?: string;
}

export interface CreateCheckoutInput {
  agencyId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * A normalized, signature-verified Stripe webhook event. The gateway extracts
 * only the fields the service needs; `agencyId` comes from the metadata we set at
 * checkout, `priceId` lets the service map back to a plan.
 */
export interface StripeWebhookEvent {
  type: string;
  agencyId?: string;
  customerId?: string;
  subscriptionId?: string;
  status?: SubscriptionStatus;
  priceId?: string;
  currentPeriodEnd?: Date;
}

export interface StripeGateway {
  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>;
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }>;
  /** Verify the signature and return the normalized event, or throw. */
  parseWebhookEvent(rawBody: string, signature: string | null): StripeWebhookEvent;
}
