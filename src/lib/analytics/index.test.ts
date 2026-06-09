import { describe, it, expect } from "vitest";
import { AnalyticsService } from "./index";
import { FakeAnalyticsStore } from "./fakes/fake-analytics-store";
import type { Platform, Publisher, AnalyticsSnapshotData } from "@/lib/publishers/types";
import { NotFoundError } from "@/lib/errors/app-error";

function fakePublisher(snap: AnalyticsSnapshotData): Publisher {
  return {
    platform: "linkedin" as Platform,
    authorizeUrl: () => "",
    exchangeCode: async () => ({ externalId: "x", accessToken: "t" }),
    publish: async () => ({ externalId: "p" }),
    fetchMetrics: async () => snap,
  };
}

function setup(snap: AnalyticsSnapshotData) {
  const store = new FakeAnalyticsStore();
  const calls: Array<{ accessToken: string; externalId: string }> = [];
  const publisher: Publisher = {
    ...fakePublisher(snap),
    fetchMetrics: async (ref) => {
      calls.push(ref);
      return snap;
    },
  };
  const svc = new AnalyticsService({
    store,
    resolvePublisher: () => publisher,
    decrypt: (s) => s.replace(/^enc:/, ""), // identity-ish, asserts decrypt ran
    clock: () => new Date("2026-06-09T00:00:00Z"),
  });
  return { svc, store, calls };
}

const SNAP: AnalyticsSnapshotData = {
  impressions: 1000,
  likes: 50,
  comments: 4,
  shares: 2,
  capturedAt: new Date("2026-06-09T12:00:00Z"),
};

describe("AnalyticsService.refresh", () => {
  it("decrypts the token, fetches metrics, and stores a snapshot", async () => {
    const { svc, store, calls } = setup(SNAP);
    store.seedPost("ag1", {
      publishJobId: "job1",
      platform: "linkedin",
      postExternalId: "urn:li:share:99",
      accessTokenEnc: "enc:secret-token",
    });

    const result = await svc.refresh({ agencyId: "ag1" }, "job1");

    expect(calls).toEqual([{ accessToken: "secret-token", externalId: "urn:li:share:99" }]);
    expect(result.metrics).toEqual({ impressions: 1000, likes: 50, comments: 4, shares: 2 });
    expect(result.capturedAt.toISOString()).toBe("2026-06-09T12:00:00.000Z");

    const saved = await store.listSnapshots("ag1", "job1");
    expect(saved).toHaveLength(1);
    expect(saved[0]!.metrics.impressions).toBe(1000);
  });

  it("omits absent metric fields rather than writing zeros", async () => {
    const { svc, store } = setup({ likes: 7, capturedAt: new Date("2026-06-09T00:00:00Z") });
    store.seedPost("ag1", {
      publishJobId: "job2",
      platform: "linkedin",
      postExternalId: "p2",
      accessTokenEnc: "enc:t",
    });
    const result = await svc.refresh({ agencyId: "ag1" }, "job2");
    expect(result.metrics).toEqual({ likes: 7 });
  });

  it("throws NotFoundError when the job is not a published post (or wrong agency)", async () => {
    const { svc, store } = setup(SNAP);
    store.seedPost("ag1", {
      publishJobId: "job1",
      platform: "linkedin",
      postExternalId: "p",
      accessTokenEnc: "enc:t",
    });
    await expect(svc.refresh({ agencyId: "other" }, "job1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.refresh({ agencyId: "ag1" }, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("AnalyticsService.list", () => {
  it("returns stored snapshots newest first", async () => {
    const { svc, store } = setup(SNAP);
    store.seedPost("ag1", {
      publishJobId: "job1",
      platform: "linkedin",
      postExternalId: "p",
      accessTokenEnc: "enc:t",
    });
    await svc.refresh({ agencyId: "ag1" }, "job1");
    await svc.refresh({ agencyId: "ag1" }, "job1");
    const list = await svc.list({ agencyId: "ag1" }, "job1");
    expect(list).toHaveLength(2);
  });
});
