import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: { getStatus: vi.fn(), startCheckout: vi.fn(), handleWebhook: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  billingService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET } from "./route";
import { POST as CHECKOUT } from "./checkout/route";
import { POST as WEBHOOK } from "./webhook/route";

const jsonReq = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  h.svc.getStatus.mockReset();
  h.svc.startCheckout.mockReset();
  h.svc.handleWebhook.mockReset();
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("GET /api/billing", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    expect((await GET()).status).toBe(401);
  });

  it("403 for a client_reviewer", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "client_reviewer" });
    expect((await GET()).status).toBe(403);
    expect(h.svc.getStatus).not.toHaveBeenCalled();
  });

  it("returns the billing status", async () => {
    h.svc.getStatus.mockResolvedValue({ plan: "pro", status: "active", currentPeriodEnd: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ billing: { plan: "pro" } });
  });
});

describe("POST /api/billing/checkout", () => {
  it("403 cross-origin", async () => {
    const res = await CHECKOUT(
      jsonReq("/api/billing/checkout", "POST", { plan: "pro" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(h.svc.startCheckout).not.toHaveBeenCalled();
  });

  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await CHECKOUT(jsonReq("/api/billing/checkout", "POST", { plan: "pro" }));
    expect(res.status).toBe(403);
  });

  it("400 on an unknown plan", async () => {
    const res = await CHECKOUT(jsonReq("/api/billing/checkout", "POST", { plan: "enterprise" }));
    expect(res.status).toBe(400);
    expect(h.svc.startCheckout).not.toHaveBeenCalled();
  });

  it("returns the checkout url for an admin", async () => {
    h.svc.startCheckout.mockResolvedValue({ url: "https://checkout.stripe.com/c/x" });
    const res = await CHECKOUT(jsonReq("/api/billing/checkout", "POST", { plan: "starter" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: "https://checkout.stripe.com/c/x" });
    expect(h.svc.startCheckout).toHaveBeenCalledWith(
      { agencyId: "ag1" },
      "starter",
      expect.any(String),
      expect.any(String),
    );
  });
});

describe("POST /api/billing/webhook", () => {
  it("passes the raw body + signature to the service (no auth required)", async () => {
    h.svc.handleWebhook.mockResolvedValue(undefined);
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=abc" },
      body: '{"type":"x"}',
    });
    const res = await WEBHOOK(req);
    expect(res.status).toBe(200);
    expect(h.svc.handleWebhook).toHaveBeenCalledWith('{"type":"x"}', "t=1,v1=abc");
  });

  it("surfaces a signature failure as the thrown status", async () => {
    const { ForbiddenError } = await import("@/lib/errors/app-error");
    h.svc.handleWebhook.mockRejectedValue(new ForbiddenError("Stripe signature mismatch"));
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "bad" },
      body: "{}",
    });
    expect((await WEBHOOK(req)).status).toBe(403);
  });
});
