import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/app-error";

const h = vi.hoisted(() => ({
  svc: {
    list: vi.fn(),
    reattach: vi.fn(),
    versions: vi.fn(),
    setArchived: vi.fn(),
    runRetention: vi.fn(),
    purgeArchived: vi.fn(),
  },
  authFn: () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "agency_admin" as string }),
}));

vi.mock("@/app/api/_lib/deps", () => ({
  mediaLibraryService: () => h.svc,
  requireRequestAuth: () => h.authFn(),
}));

import { GET as browseGET } from "../clients/[id]/media/route";
import { POST as retentionPOST } from "../clients/[id]/media/retention/route";
import { POST as purgePOST } from "../clients/[id]/media/purge/route";
import { POST as reattachPOST } from "./[id]/reattach/route";
import { PATCH as archivePATCH } from "./[id]/route";
import { GET as versionsGET } from "./[id]/versions/route";

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

describe("GET /api/clients/[id]/media", () => {
  it("401 when unauthenticated", async () => {
    h.authFn = () => {
      throw new UnauthorizedError();
    };
    const res = await browseGET(req("/api/clients/cl1/media", "GET"), { params: { id: "cl1" } });
    expect(res.status).toBe(401);
  });

  it("403 for a client reviewer", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "client_reviewer" });
    const res = await browseGET(req("/api/clients/cl1/media", "GET"), { params: { id: "cl1" } });
    expect(res.status).toBe(403);
  });

  it("lists with parsed filters for a strategist", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    h.svc.list.mockResolvedValue([{ id: "a1" }]);
    const res = await browseGET(
      req("/api/clients/cl1/media?kind=video&includeArchived=1", "GET"),
      { params: { id: "cl1" } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ assets: [{ id: "a1" }] });
    expect(h.svc.list).toHaveBeenCalledWith({ agencyId: "ag1" }, "cl1", {
      kind: "video",
      includeArchived: true,
    });
  });
});

describe("POST /api/media/[id]/reattach", () => {
  it("400 when targetItemId is missing", async () => {
    const res = await reattachPOST(req("/api/media/a1/reattach", "POST", {}), {
      params: { id: "a1" },
    });
    expect(res.status).toBe(400);
    expect(h.svc.reattach).not.toHaveBeenCalled();
  });

  it("201 with the reused asset", async () => {
    h.svc.reattach.mockResolvedValue({ id: "a2", source: "reused" });
    const res = await reattachPOST(
      req("/api/media/a1/reattach", "POST", { targetItemId: "it2" }),
      { params: { id: "a1" } },
    );
    expect(res.status).toBe(201);
    expect(h.svc.reattach).toHaveBeenCalledWith({ agencyId: "ag1" }, "a1", "it2");
  });
});

describe("PATCH /api/media/[id]", () => {
  it("400 on a non-boolean archived", async () => {
    const res = await archivePATCH(req("/api/media/a1", "PATCH", { archived: "yes" }), {
      params: { id: "a1" },
    });
    expect(res.status).toBe(400);
  });

  it("archives an asset", async () => {
    h.svc.setArchived.mockResolvedValue(undefined);
    const res = await archivePATCH(req("/api/media/a1", "PATCH", { archived: true }), {
      params: { id: "a1" },
    });
    expect(res.status).toBe(200);
    expect(h.svc.setArchived).toHaveBeenCalledWith({ agencyId: "ag1" }, "a1", true);
  });
});

describe("GET /api/media/[id]/versions", () => {
  it("returns the version group", async () => {
    h.svc.versions.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    const res = await versionsGET(req("/api/media/a1/versions", "GET"), { params: { id: "a1" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ versions: [{ version: 1 }, { version: 2 }] });
  });
});

describe("POST /api/clients/[id]/media/retention", () => {
  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await retentionPOST(
      req("/api/clients/cl1/media/retention", "POST", { olderThanDays: 30 }),
      { params: { id: "cl1" } },
    );
    expect(res.status).toBe(403);
  });

  it("400 on an out-of-range window", async () => {
    const res = await retentionPOST(
      req("/api/clients/cl1/media/retention", "POST", { olderThanDays: 0 }),
      { params: { id: "cl1" } },
    );
    expect(res.status).toBe(400);
    expect(h.svc.runRetention).not.toHaveBeenCalled();
  });

  it("sweeps for an admin and returns the count", async () => {
    h.svc.runRetention.mockResolvedValue({ archived: 4 });
    const res = await retentionPOST(
      req("/api/clients/cl1/media/retention", "POST", { olderThanDays: 30 }),
      { params: { id: "cl1" } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ archived: 4 });
    expect(h.svc.runRetention).toHaveBeenCalledWith({ agencyId: "ag1" }, "cl1", 30);
  });
});

describe("POST /api/clients/[id]/media/purge", () => {
  it("403 for a non-admin", async () => {
    h.authFn = () => ({ ctx: { agencyId: "ag1" }, userId: "u1", role: "strategist" });
    const res = await purgePOST(
      req("/api/clients/cl1/media/purge", "POST", { archivedForDays: 30 }),
      { params: { id: "cl1" } },
    );
    expect(res.status).toBe(403);
  });

  it("purges for an admin and returns the counts", async () => {
    h.svc.purgeArchived.mockResolvedValue({ purged: 3, blobsDeleted: 2 });
    const res = await purgePOST(
      req("/api/clients/cl1/media/purge", "POST", { archivedForDays: 30 }),
      { params: { id: "cl1" } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ purged: 3, blobsDeleted: 2 });
    expect(h.svc.purgeArchived).toHaveBeenCalledWith({ agencyId: "ag1" }, "cl1", 30);
  });
});
