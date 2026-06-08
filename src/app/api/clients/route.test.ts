import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

// Mock the request-scoped wiring so handlers run without a DB.
const h = vi.hoisted(() => ({
  repo: { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  clientRepository: () => h.repo,
  requireRequestAuth: () => h.authFn(),
}));

import { GET, POST } from "./route";

beforeEach(() => {
  h.repo.list.mockReset();
  h.repo.create.mockReset();
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("GET /api/clients", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    const res = await GET(new Request("http://localhost/api/clients"));
    expect(res.status).toBe(401);
  });

  it("returns the agency-scoped page", async () => {
    h.repo.list.mockResolvedValue({ items: [{ id: "c1" }], nextCursor: null, hasMore: false });
    const res = await GET(new Request("http://localhost/api/clients?limit=10"));
    expect(res.status).toBe(200);
    expect(h.repo.list).toHaveBeenCalledWith({ agencyId: "ag1" }, { cursor: undefined, limit: 10 });
    expect(await res.json()).toMatchObject({ items: [{ id: "c1" }] });
  });

  it("400 on a non-numeric limit", async () => {
    const res = await GET(new Request("http://localhost/api/clients?limit=abc"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/clients", () => {
  it("403 on a cross-origin request", async () => {
    const res = await POST(
      new Request("http://localhost/api/clients", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: JSON.stringify({ name: "Acme" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it("creates a client (201) scoped to the agency", async () => {
    h.repo.create.mockResolvedValue({
      id: "c2",
      agencyId: "ag1",
      name: "Acme",
      websiteUrl: null,
      niche: null,
      createdAt: new Date(),
    });
    const res = await POST(
      new Request("http://localhost/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(h.repo.create).toHaveBeenCalledWith({ agencyId: "ag1" }, { name: "Acme" });
  });

  it("400 on an invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});
