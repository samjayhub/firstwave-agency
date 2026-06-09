import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: {
    evaluateItem: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  complianceService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET as itemGET } from "../content-items/[id]/compliance/route";
import { GET as settingsGET, PUT as settingsPUT } from "./settings/route";

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

describe("GET /api/content-items/[id]/compliance", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    const res = await itemGET(req("/api/content-items/i1/compliance", "GET"), {
      params: { id: "i1" },
    });
    expect(res.status).toBe(401);
  });

  it("returns the report for a strategist", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    h.svc.evaluateItem.mockResolvedValue({ ok: false, violations: [{ rule: "banned_term" }] });
    const res = await itemGET(req("/api/content-items/i1/compliance", "GET"), {
      params: { id: "i1" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ report: { ok: false } });
    expect(h.svc.evaluateItem).toHaveBeenCalledWith({ agencyId: "ag1" }, "i1");
  });
});

describe("compliance settings", () => {
  it("403 for a non-admin on GET", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    expect((await settingsGET()).status).toBe(403);
  });

  it("returns settings for an admin", async () => {
    h.svc.getSettings.mockResolvedValue({ enabled: true, bannedTerms: [] });
    const res = await settingsGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settings: { enabled: true } });
  });

  it("rejects unknown fields on PUT", async () => {
    const res = await settingsPUT(req("/api/compliance/settings", "PUT", { bogus: 1 }));
    expect(res.status).toBe(400);
    expect(h.svc.updateSettings).not.toHaveBeenCalled();
  });

  it("updates settings for an admin", async () => {
    h.svc.updateSettings.mockResolvedValue({ enabled: true, bannedTerms: ["spam"] });
    const res = await settingsPUT(
      req("/api/compliance/settings", "PUT", { bannedTerms: ["spam"], requireDisclosure: true }),
    );
    expect(res.status).toBe(200);
    expect(h.svc.updateSettings).toHaveBeenCalledWith(
      { agencyId: "ag1" },
      { bannedTerms: ["spam"], requireDisclosure: true },
    );
  });
});
