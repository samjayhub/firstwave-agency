import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  apiKeySvc: { authenticate: vi.fn(), mint: vi.fn(), list: vi.fn() },
  clientRepo: { list: vi.fn(), get: vi.fn() },
  perfSvc: { brief: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  apiKeyService: () => h.apiKeySvc,
  clientRepository: () => h.clientRepo,
  performanceService: () => h.perfSvc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET as clientsGET } from "./clients/route";
import { GET as perfGET } from "./clients/[id]/performance/route";
import { POST as mintPOST } from "../api-keys/route";

const req = (method: string, headers: Record<string, string> = {}, body?: unknown) =>
  new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  h.apiKeySvc.authenticate.mockReset();
  h.clientRepo.list.mockReset();
  h.perfSvc.brief.mockReset();
  h.apiKeySvc.mint.mockReset();
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("public API auth", () => {
  it("401 without a valid bearer key", async () => {
    h.apiKeySvc.authenticate.mockResolvedValue(null);
    const res = await clientsGET(req("GET"));
    expect(res.status).toBe(401);
    expect(h.clientRepo.list).not.toHaveBeenCalled();
  });

  it("lists clients for a valid key, scoped to its agency", async () => {
    h.apiKeySvc.authenticate.mockResolvedValue({ agencyId: "ag9" });
    h.clientRepo.list.mockResolvedValue({ items: [{ id: "c1" }], nextCursor: null });
    const res = await clientsGET(req("GET", { authorization: "Bearer fw_x_y" }));
    expect(res.status).toBe(200);
    expect(h.clientRepo.list).toHaveBeenCalledWith({ agencyId: "ag9" }, { limit: 100 });
    expect(await res.json()).toMatchObject({ clients: [{ id: "c1" }] });
  });

  it("returns the performance brief for a key", async () => {
    h.apiKeySvc.authenticate.mockResolvedValue({ agencyId: "ag1" });
    h.perfSvc.brief.mockResolvedValue(null);
    const res = await perfGET(req("GET", { authorization: "Bearer fw_x_y" }), {
      params: { id: "c1" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ performance: null });
  });
});

describe("api-key management (session)", () => {
  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await mintPOST(req("POST", {}, { name: "CI" }));
    expect(res.status).toBe(403);
    expect(h.apiKeySvc.mint).not.toHaveBeenCalled();
  });

  it("mints a key (201) for an admin", async () => {
    h.apiKeySvc.mint.mockResolvedValue({ id: "k1", name: "CI", prefix: "ab", token: "fw_ab_secret" });
    const res = await mintPOST(req("POST", {}, { name: "CI" }));
    expect(res.status).toBe(201);
    expect(h.apiKeySvc.mint).toHaveBeenCalledWith({ agencyId: "ag1" }, "CI");
  });
});
