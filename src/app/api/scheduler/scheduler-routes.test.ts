import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: { tick: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  schedulerService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { POST } from "./tick/route";

const jsonReq = (method: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/scheduler/tick", {
    method,
    headers: { "content-type": "application/json", ...headers },
  });

beforeEach(() => {
  h.svc.tick.mockReset();
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("POST /api/scheduler/tick", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    const res = await POST(jsonReq("POST"));
    expect(res.status).toBe(401);
    expect(h.svc.tick).not.toHaveBeenCalled();
  });

  it("403 on a cross-origin request", async () => {
    const res = await POST(jsonReq("POST", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(h.svc.tick).not.toHaveBeenCalled();
  });

  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await POST(jsonReq("POST"));
    expect(res.status).toBe(403);
    expect(h.svc.tick).not.toHaveBeenCalled();
  });

  it("runs a tick scoped to the caller's agency", async () => {
    h.svc.tick.mockResolvedValue({ due: 2, scheduled: 2, itemIds: ["a", "b"] });
    const res = await POST(jsonReq("POST"));
    expect(res.status).toBe(200);
    expect(h.svc.tick).toHaveBeenCalledWith({ agencyId: "ag1" });
    expect(await res.json()).toMatchObject({ scheduled: 2, itemIds: ["a", "b"] });
  });
});
