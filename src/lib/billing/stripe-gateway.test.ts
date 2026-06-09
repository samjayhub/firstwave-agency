import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { HttpStripeGateway } from "./stripe-gateway";

const SECRET = "whsec_test";
const NOW_MS = 1_700_000_000_000;

function gateway(fetchFn?: typeof fetch) {
  return new HttpStripeGateway({
    secretKey: "sk_test",
    webhookSecret: SECRET,
    ...(fetchFn ? { fetchFn } : {}),
    now: () => NOW_MS,
  });
}

/** Build a valid `t=...,v1=...` header for a payload, signed like Stripe does. */
function sign(payload: string, atMs = NOW_MS): string {
  const t = Math.floor(atMs / 1000);
  const v1 = createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("HttpStripeGateway.createCustomer", () => {
  it("posts metadata[agencyId] and returns the id", async () => {
    let sentBody = "";
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      sentBody = String(init?.body);
      return json({ id: "cus_1" });
    }) as unknown as typeof fetch;
    const out = await gateway(fetchFn).createCustomer({ agencyId: "ag1", email: "a@b.com" });
    expect(out.id).toBe("cus_1");
    expect(sentBody).toContain("metadata%5BagencyId%5D=ag1");
  });
});

describe("HttpStripeGateway.createCheckoutSession", () => {
  it("returns the hosted checkout url", async () => {
    const out = await gateway(
      (async () => json({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" })) as unknown as typeof fetch,
    ).createCheckoutSession({
      agencyId: "ag1",
      customerId: "cus_1",
      priceId: "price_pro",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/no",
    });
    expect(out.url).toContain("checkout.stripe.com");
  });

  it("maps a non-2xx response to ExternalServiceError", async () => {
    await expect(
      gateway((async () => new Response("nope", { status: 402 })) as unknown as typeof fetch)
        .createCheckoutSession({
          agencyId: "ag1",
          customerId: "cus_1",
          priceId: "price_pro",
          successUrl: "https://app/ok",
          cancelUrl: "https://app/no",
        }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});

describe("HttpStripeGateway.parseWebhookEvent", () => {
  it("verifies a valid signature and normalizes the event", () => {
    const payload = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          current_period_end: 1_700_001_000,
          items: { data: [{ price: { id: "price_pro" } }] },
          metadata: { agencyId: "ag1" },
        },
      },
    });
    const event = gateway().parseWebhookEvent(payload, sign(payload));
    expect(event).toMatchObject({
      type: "customer.subscription.updated",
      agencyId: "ag1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      priceId: "price_pro",
    });
    expect(event.currentPeriodEnd?.getTime()).toBe(1_700_001_000 * 1000);
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const payload = JSON.stringify({ type: "x", data: { object: {} } });
    const header = sign(payload);
    expect(() => gateway().parseWebhookEvent(payload + "tamper", header)).toThrow();
  });

  it("rejects a missing signature header", () => {
    expect(() => gateway().parseWebhookEvent("{}", null)).toThrowError(/signature/i);
  });

  it("rejects a stale timestamp (replay)", () => {
    const payload = JSON.stringify({ type: "x", data: { object: {} } });
    const stale = sign(payload, NOW_MS - 10 * 60_000); // 10 min old
    expect(() => gateway().parseWebhookEvent(payload, stale)).toThrowError(/tolerance/i);
  });

  it("reads checkout.session.completed's subscription + client_reference_id", () => {
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: { customer: "cus_2", subscription: "sub_2", client_reference_id: "ag2" },
      },
    });
    const event = gateway().parseWebhookEvent(payload, sign(payload));
    expect(event).toMatchObject({
      type: "checkout.session.completed",
      agencyId: "ag2",
      customerId: "cus_2",
      subscriptionId: "sub_2",
    });
  });
});
