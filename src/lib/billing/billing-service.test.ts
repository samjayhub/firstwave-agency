import { describe, it, expect, beforeEach } from "vitest";
import { BillingService } from "./index";
import { FakeStripeGateway } from "./stripe-gateway";
import { FakeBillingStore } from "@/lib/repositories/fakes/fake-billing-store";

const AGENCY_A = { agencyId: "agency_A" };
const PRICES = { starter: "price_starter", pro: "price_pro" };

describe("BillingService.getStatus", () => {
  it("reports the free plan when no subscription row exists", async () => {
    const svc = new BillingService({
      store: new FakeBillingStore(),
      gateway: new FakeStripeGateway(),
      prices: PRICES,
    });
    expect(await svc.getStatus(AGENCY_A)).toEqual({
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
    });
  });
});

describe("BillingService.startCheckout", () => {
  let store: FakeBillingStore;
  let gateway: FakeStripeGateway;
  let svc: BillingService;

  beforeEach(() => {
    store = new FakeBillingStore();
    gateway = new FakeStripeGateway();
    svc = new BillingService({ store, gateway, prices: PRICES });
  });

  it("creates + persists a customer on first upgrade and returns a url", async () => {
    const { url } = await svc.startCheckout(AGENCY_A, "pro", "https://app/ok", "https://app/no");
    expect(url).toContain("checkout.stripe.test");
    const sub = await store.getByAgency("agency_A");
    expect(sub?.stripeCustomerId).toBe("cus_fake_agency_A");
  });

  it("reuses an existing customer on a second checkout", async () => {
    await store.upsertByAgency("agency_A", { stripeCustomerId: "cus_existing" });
    await svc.startCheckout(AGENCY_A, "starter", "https://app/ok", "https://app/no");
    const sub = await store.getByAgency("agency_A");
    expect(sub?.stripeCustomerId).toBe("cus_existing");
  });

  it("rejects checking out the free plan", async () => {
    await expect(
      svc.startCheckout(AGENCY_A, "free", "https://app/ok", "https://app/no"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("BillingService.applyWebhook", () => {
  let store: FakeBillingStore;
  let svc: BillingService;

  beforeEach(() => {
    store = new FakeBillingStore();
    svc = new BillingService({ store, gateway: new FakeStripeGateway(), prices: PRICES });
  });

  it("activates a subscription and maps the price to a plan", async () => {
    await svc.applyWebhook({
      type: "customer.subscription.updated",
      agencyId: "agency_A",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      priceId: "price_pro",
      currentPeriodEnd: new Date(1_700_000_000_000),
    });
    const sub = await store.getByAgency("agency_A");
    expect(sub).toMatchObject({
      plan: "pro",
      status: "active",
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
    });
  });

  it("drops the agency back to free on subscription.deleted", async () => {
    await store.upsertByAgency("agency_A", {
      plan: "pro",
      status: "active",
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
    });
    await svc.applyWebhook({
      type: "customer.subscription.deleted",
      customerId: "cus_1", // resolves agency via customer lookup (no metadata)
    });
    const sub = await store.getByAgency("agency_A");
    expect(sub).toMatchObject({ plan: "free", status: "canceled", stripeSubscriptionId: null });
  });

  it("no-ops an event it cannot attribute to an agency", async () => {
    await svc.applyWebhook({ type: "customer.subscription.updated", status: "active" });
    expect(await store.getByAgency("agency_A")).toBeNull();
  });

  it("ignores unmodeled event types", async () => {
    await svc.applyWebhook({ type: "invoice.paid", agencyId: "agency_A" });
    expect(await store.getByAgency("agency_A")).toBeNull();
  });
});
