import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalService } from "./index";
import { FakeApprovalStore } from "@/lib/repositories/fakes/fake-publish-stores";
import type { ItemStatus } from "./state-machine";

function seedItem(store: FakeApprovalStore, status: ItemStatus) {
  store.seed({
    id: "item_1",
    agencyId: "ag1",
    clientId: "cl1",
    status,
    scheduledAt: null,
    copy: null,
  });
}

describe("ApprovalService", () => {
  let store: FakeApprovalStore;
  let svc: ApprovalService;

  beforeEach(() => {
    store = new FakeApprovalStore();
    svc = new ApprovalService(store);
  });

  it("submits draft → in_review", async () => {
    seedItem(store, "draft");
    const item = await svc.submit({ agencyId: "ag1" }, "item_1");
    expect(item.status).toBe("in_review");
  });

  it("approves in_review → approved", async () => {
    seedItem(store, "in_review");
    expect((await svc.approve({ agencyId: "ag1" }, "item_1")).status).toBe("approved");
  });

  it("rejects an illegal transition with ConflictError", async () => {
    seedItem(store, "draft");
    // approve requires in_review
    await expect(svc.approve({ agencyId: "ag1" }, "item_1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses an item in another agency (NotFound)", async () => {
    seedItem(store, "draft");
    await expect(svc.submit({ agencyId: "intruder" }, "item_1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("schedule enforces the approval gate (approved → scheduled only)", async () => {
    seedItem(store, "in_review");
    await expect(svc.schedule({ agencyId: "ag1" }, "item_1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    store.items.get("item_1")!.status = "approved";
    expect((await svc.schedule({ agencyId: "ag1" }, "item_1")).status).toBe("scheduled");
  });
});
