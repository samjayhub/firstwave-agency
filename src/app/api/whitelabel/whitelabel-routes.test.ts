import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: { getSettings: vi.fn(), updateSettings: vi.fn(), resolvePublic: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  whiteLabelService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET, PUT } from "./route";
import { GET as PUBLIC_GET } from "./public/[agencyId]/route";

const jsonReq = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  h.svc.getSettings.mockReset();
  h.svc.updateSettings.mockReset();
  h.svc.resolvePublic.mockReset();
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("GET /api/whitelabel", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    expect((await GET()).status).toBe(401);
  });

  it("403 for a client_reviewer", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "client_reviewer" });
    expect((await GET()).status).toBe(403);
  });

  it("returns the branding for an admin", async () => {
    h.svc.getSettings.mockResolvedValue({ agencyId: "ag1", brandName: "Acme" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ branding: { brandName: "Acme" } });
  });
});

describe("PUT /api/whitelabel", () => {
  it("403 cross-origin", async () => {
    const res = await PUT(
      jsonReq("/api/whitelabel", "PUT", { brandName: "Acme" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(h.svc.updateSettings).not.toHaveBeenCalled();
  });

  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await PUT(jsonReq("/api/whitelabel", "PUT", { brandName: "Acme" }));
    expect(res.status).toBe(403);
  });

  it("400 on an invalid hex colour", async () => {
    const res = await PUT(jsonReq("/api/whitelabel", "PUT", { primaryColor: "red" }));
    expect(res.status).toBe(400);
    expect(h.svc.updateSettings).not.toHaveBeenCalled();
  });

  it("400 on an empty patch", async () => {
    const res = await PUT(jsonReq("/api/whitelabel", "PUT", {}));
    expect(res.status).toBe(400);
  });

  it("400 on an unknown field (strict)", async () => {
    const res = await PUT(jsonReq("/api/whitelabel", "PUT", { evil: "x" }));
    expect(res.status).toBe(400);
  });

  it("updates branding for an admin", async () => {
    h.svc.updateSettings.mockResolvedValue({ agencyId: "ag1", brandName: "Acme" });
    const res = await PUT(jsonReq("/api/whitelabel", "PUT", { brandName: "Acme", primaryColor: "#4F46E5" }));
    expect(res.status).toBe(200);
    expect(h.svc.updateSettings).toHaveBeenCalledWith(
      { agencyId: "ag1" },
      { brandName: "Acme", primaryColor: "#4F46E5" },
    );
  });
});

describe("GET /api/whitelabel/public/[agencyId]", () => {
  it("returns display-safe branding without auth", async () => {
    h.svc.resolvePublic.mockResolvedValue({ brandName: "Acme", logoUrl: null, primaryColor: "#000" });
    const res = await PUBLIC_GET(jsonReq("/api/whitelabel/public/ag9", "GET"), {
      params: { agencyId: "ag9" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ branding: { brandName: "Acme" } });
    expect(h.svc.resolvePublic).toHaveBeenCalledWith("ag9");
  });
});
