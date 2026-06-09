import { describe, expect, it, vi } from "vitest";
import { PerformanceService } from "./index";
import type { PerformanceRecord, PerformanceStore } from "./types";

function fakeStore(records: PerformanceRecord[]): PerformanceStore & { calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    recentPerformance: vi.fn(async (_a: string, _c: string, limit: number) => {
      calls.push(limit);
      return records;
    }),
  };
}

describe("PerformanceService.briefForClient", () => {
  it("returns null when the client has no measured posts", async () => {
    const svc = new PerformanceService({ store: fakeStore([]) });
    expect(await svc.briefForClient("ag1", "c1")).toBeNull();
  });

  it("summarizes the store's records into a brief", async () => {
    const svc = new PerformanceService({
      store: fakeStore([
        { platform: "linkedin", pillar: "story", format: "image", idea: "x", metrics: { shares: 9 } },
      ]),
    });
    const brief = await svc.briefForClient("ag1", "c1");
    expect(brief).toMatchObject({ sampleSize: 1, topPillars: ["story"] });
  });

  it("passes the configured sample limit through to the store", async () => {
    const store = fakeStore([]);
    const svc = new PerformanceService({ store, sampleLimit: 12 });
    await svc.briefForClient("ag1", "c1");
    expect(store.calls).toEqual([12]);
  });

  it("scopes by agency via brief(ctx, clientId)", async () => {
    const store = fakeStore([]);
    const svc = new PerformanceService({ store });
    await svc.brief({ agencyId: "ag9" }, "c1");
    expect(store.recentPerformance).toHaveBeenCalledWith("ag9", "c1", 50);
  });
});
