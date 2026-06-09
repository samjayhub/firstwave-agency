import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

// Mock the request-scoped wiring so handlers run without a DB.
const h = vi.hoisted(() => ({
  svc: { list: vi.fn(), invite: vi.fn(), updateRole: vi.fn(), remove: vi.fn() },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  teamService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";

const jsonReq = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  h.svc.list.mockReset();
  h.svc.invite.mockReset();
  h.svc.updateRole.mockReset();
  h.svc.remove.mockReset();
  h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" });
});

describe("GET /api/team", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 for a client_reviewer", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "client_reviewer" });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(h.svc.list).not.toHaveBeenCalled();
  });

  it("returns the roster for an admin", async () => {
    h.svc.list.mockResolvedValue([{ id: "u1", role: "agency_admin" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(h.svc.list).toHaveBeenCalledWith({ agencyId: "ag1" });
    expect(await res.json()).toMatchObject({ members: [{ id: "u1" }] });
  });

  it("allows a strategist to view the roster", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    h.svc.list.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/team", () => {
  it("403 on a cross-origin request", async () => {
    const res = await POST(
      jsonReq("/api/team", "POST", { email: "x@y.com", role: "strategist", password: "supersecret" }, {
        origin: "https://evil.example",
      }),
    );
    expect(res.status).toBe(403);
    expect(h.svc.invite).not.toHaveBeenCalled();
  });

  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await POST(
      jsonReq("/api/team", "POST", { email: "x@y.com", role: "strategist", password: "supersecret" }),
    );
    expect(res.status).toBe(403);
    expect(h.svc.invite).not.toHaveBeenCalled();
  });

  it("invites a teammate (201)", async () => {
    h.svc.invite.mockResolvedValue({ id: "u2", email: "x@y.com", role: "strategist" });
    const res = await POST(
      jsonReq("/api/team", "POST", { email: "x@y.com", role: "strategist", password: "supersecret" }),
    );
    expect(res.status).toBe(201);
    expect(h.svc.invite).toHaveBeenCalledWith(
      { agencyId: "ag1" },
      { email: "x@y.com", role: "strategist", password: "supersecret" },
    );
  });

  it("400 on an invalid role", async () => {
    const res = await POST(
      jsonReq("/api/team", "POST", { email: "x@y.com", role: "superuser", password: "supersecret" }),
    );
    expect(res.status).toBe(400);
    expect(h.svc.invite).not.toHaveBeenCalled();
  });

  it("400 on a short password", async () => {
    const res = await POST(
      jsonReq("/api/team", "POST", { email: "x@y.com", role: "strategist", password: "short" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/team/[id]", () => {
  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await PATCH(jsonReq("/api/team/u2", "PATCH", { role: "client_reviewer" }), {
      params: { id: "u2" },
    });
    expect(res.status).toBe(403);
    expect(h.svc.updateRole).not.toHaveBeenCalled();
  });

  it("updates a role", async () => {
    h.svc.updateRole.mockResolvedValue({ id: "u2", role: "client_reviewer" });
    const res = await PATCH(jsonReq("/api/team/u2", "PATCH", { role: "client_reviewer" }), {
      params: { id: "u2" },
    });
    expect(res.status).toBe(200);
    expect(h.svc.updateRole).toHaveBeenCalledWith({ agencyId: "ag1" }, "u2", "client_reviewer");
  });

  it("400 on an invalid role", async () => {
    const res = await PATCH(jsonReq("/api/team/u2", "PATCH", { role: "root" }), {
      params: { id: "u2" },
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/team/[id]", () => {
  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "client_reviewer" });
    const res = await DELETE(jsonReq("/api/team/u2", "DELETE"), { params: { id: "u2" } });
    expect(res.status).toBe(403);
    expect(h.svc.remove).not.toHaveBeenCalled();
  });

  it("removes a teammate and passes the acting user id", async () => {
    h.svc.remove.mockResolvedValue(undefined);
    const res = await DELETE(jsonReq("/api/team/u2", "DELETE"), { params: { id: "u2" } });
    expect(res.status).toBe(200);
    expect(h.svc.remove).toHaveBeenCalledWith({ agencyId: "ag1" }, "u1", "u2");
  });
});
