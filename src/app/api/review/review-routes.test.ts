import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: {
    portal: vi.fn(),
    decide: vi.fn(),
    createLink: vi.fn(),
    listLinks: vi.fn(),
    revokeLink: vi.fn(),
  },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  reviewService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET as portalGET } from "./[token]/route";
import { POST as decidePOST } from "./[token]/decide/route";
import { POST as mintPOST, GET as listGET } from "../clients/[id]/review-links/route";

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  Object.values(h.svc).forEach((m) => m.mockReset());
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("GET /api/review/[token] (public)", () => {
  it("returns the portal payload with no auth", async () => {
    h.svc.portal.mockResolvedValue({ clientName: "Acme", branding: {}, items: [] });
    const res = await portalGET(req("/api/review/tok", "GET"), { params: { token: "tok" } });
    expect(res.status).toBe(200);
    expect(h.svc.portal).toHaveBeenCalledWith("tok");
  });
});

describe("POST /api/review/[token]/decide (public)", () => {
  it("403 on cross-origin", async () => {
    const res = await decidePOST(
      req("/api/review/tok/decide", "POST", { itemId: "i1", decision: "approve" }, {
        origin: "https://evil.example",
      }),
      { params: { token: "tok" } },
    );
    expect(res.status).toBe(403);
    expect(h.svc.decide).not.toHaveBeenCalled();
  });

  it("400 on an invalid decision", async () => {
    const res = await decidePOST(
      req("/api/review/tok/decide", "POST", { itemId: "i1", decision: "nope" }),
      { params: { token: "tok" } },
    );
    expect(res.status).toBe(400);
  });

  it("applies a valid decision", async () => {
    h.svc.decide.mockResolvedValue({ status: "approved", comment: null });
    const res = await decidePOST(
      req("/api/review/tok/decide", "POST", { itemId: "i1", decision: "approve" }),
      { params: { token: "tok" } },
    );
    expect(res.status).toBe(200);
    expect(h.svc.decide).toHaveBeenCalledWith("tok", "i1", "approve", undefined);
  });
});

describe("POST/GET /api/clients/[id]/review-links (admin)", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    const res = await listGET(req("/api/clients/c1/review-links", "GET"), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("403 for a reviewer", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "client_reviewer" });
    const res = await mintPOST(req("/api/clients/c1/review-links", "POST"), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(h.svc.createLink).not.toHaveBeenCalled();
  });

  it("mints a link for a strategist (201)", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    h.svc.createLink.mockResolvedValue({ share: { id: "s1", token: "t" }, url: "https://x/review/t" });
    const res = await mintPOST(req("/api/clients/c1/review-links", "POST"), { params: { id: "c1" } });
    expect(res.status).toBe(201);
    expect(h.svc.createLink).toHaveBeenCalledWith({ agencyId: "ag1" }, "c1");
  });
});
