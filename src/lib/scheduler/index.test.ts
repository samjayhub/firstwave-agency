import { describe, expect, it, vi } from "vitest";
import { SchedulerService } from "./index";
import { FakeSchedulerStore, type FakeScheduledItem } from "./fakes";

const T0 = new Date("2026-06-09T12:00:00.000Z");

function item(overrides: Partial<FakeScheduledItem>): FakeScheduledItem {
  return {
    agencyId: "ag1",
    itemId: "it1",
    connectedAccountId: "ca1",
    platform: "linkedin",
    status: "approved",
    scheduledAt: new Date("2026-06-09T11:00:00.000Z"), // due (before T0)
    ...overrides,
  };
}

function makeService(items: FakeScheduledItem[], clock: Date = T0) {
  const store = new FakeSchedulerStore(items);
  const enqueue = vi.fn(async () => "job-1");
  const service = new SchedulerService({ store, enqueue, clock: () => clock });
  return { store, enqueue, service };
}

describe("SchedulerService.tick", () => {
  it("flips a due approved item to scheduled and enqueues a publish job", async () => {
    const { store, enqueue, service } = makeService([item({})]);

    const result = await service.tick();

    expect(result).toEqual({ due: 1, scheduled: 1, itemIds: ["it1"] });
    expect(enqueue).toHaveBeenCalledWith({
      agencyId: "ag1",
      itemId: "it1",
      connectedAccountId: "ca1",
    });
    expect(store.items[0]!.status).toBe("scheduled");
  });

  it("ignores items whose scheduledAt has not arrived yet", async () => {
    const future = new Date("2026-06-09T13:00:00.000Z");
    const { enqueue, service } = makeService([item({ scheduledAt: future })]);

    const result = await service.tick();

    expect(result.due).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("ignores items that are not in the approved state", async () => {
    const { enqueue, service } = makeService([
      item({ status: "draft" }),
      item({ itemId: "it2", status: "published" }),
    ]);

    const result = await service.tick();

    expect(result.scheduled).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue when the conditional flip loses the race", async () => {
    const { store, enqueue, service } = makeService([item({})]);
    // Simulate another tick claiming the item between find and mark.
    store.markScheduled = vi.fn(async () => false);

    const result = await service.tick();

    expect(result).toEqual({ due: 1, scheduled: 0, itemIds: [] });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("isolates a per-item enqueue failure from the rest of the batch", async () => {
    const { enqueue, service } = makeService([
      item({ itemId: "it1", connectedAccountId: "ca1" }),
      item({ itemId: "it2", connectedAccountId: "ca2" }),
    ]);
    enqueue.mockRejectedValueOnce(new Error("redis down"));

    const result = await service.tick();

    // it1's enqueue threw; it2 still went through.
    expect(result.scheduled).toBe(1);
    expect(result.itemIds).toEqual(["it2"]);
  });

  it("restricts to one agency when agencyId is given", async () => {
    const { enqueue, service } = makeService([
      item({ itemId: "it1", agencyId: "ag1" }),
      item({ itemId: "it2", agencyId: "ag2" }),
    ]);

    const result = await service.tick({ agencyId: "ag2" });

    expect(result.itemIds).toEqual(["it2"]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ agencyId: "ag2", itemId: "it2" }),
    );
  });
});
