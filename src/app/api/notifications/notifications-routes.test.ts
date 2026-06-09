import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: { list: vi.fn(), markRead: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  notificationService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET as listGET } from "./route";
import { POST as readPOST } from "./[id]/read/route";
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

describe("GET /api/notifications", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    expect((await listGET()).status).toBe(401);
  });

  it("returns the feed for an operator", async () => {
    h.svc.list.mockResolvedValue([{ id: "n1" }]);
    const res = await listGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ notifications: [{ id: "n1" }] });
  });
});

describe("POST /api/notifications/[id]/read", () => {
  it("404 when the notification is missing", async () => {
    h.svc.markRead.mockResolvedValue(false);
    const res = await readPOST(req("/api/notifications/n1/read", "POST"), { params: { id: "n1" } });
    expect(res.status).toBe(404);
  });

  it("marks read", async () => {
    h.svc.markRead.mockResolvedValue(true);
    const res = await readPOST(req("/api/notifications/n1/read", "POST"), { params: { id: "n1" } });
    expect(res.status).toBe(200);
    expect(h.svc.markRead).toHaveBeenCalledWith({ agencyId: "ag1" }, "n1");
  });
});

describe("notification settings", () => {
  it("403 for a non-admin on GET", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    expect((await settingsGET()).status).toBe(403);
  });

  it("validates the mutedKinds enum on PUT", async () => {
    const res = await settingsPUT(
      req("/api/notifications/settings", "PUT", { mutedKinds: ["bogus"] }),
    );
    expect(res.status).toBe(400);
    expect(h.svc.updateSettings).not.toHaveBeenCalled();
  });

  it("updates settings for an admin", async () => {
    h.svc.updateSettings.mockResolvedValue({ agencyId: "ag1", emailTo: "ops@acme.com" });
    const res = await settingsPUT(
      req("/api/notifications/settings", "PUT", { emailTo: "ops@acme.com" }),
    );
    expect(res.status).toBe(200);
    expect(h.svc.updateSettings).toHaveBeenCalledWith({ agencyId: "ag1" }, { emailTo: "ops@acme.com" });
  });
});
