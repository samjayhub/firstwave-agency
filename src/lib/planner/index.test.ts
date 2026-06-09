import { describe, it, expect } from "vitest";
import { ContentPlannerService, parsePlan } from "./index";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { FakeClientStore } from "@/lib/repositories/fakes/fake-client-store";
import {
  FakeContentItemStore,
  FakeContentPlanStore,
} from "@/lib/repositories/fakes/fake-content-stores";
import { FakeBrandProfileStore } from "@/lib/brand-intel/fakes/fake-brand-intel";
import { CopyEngineService } from "@/lib/copy";
import type { StoredCopy } from "@/lib/content/types";

const COPY_JSON = JSON.stringify({
  caption: "c",
  hook: "h",
  hashtags: ["a"],
  description: "d",
});

const PLAN_JSON = JSON.stringify([
  { day: 1, platform: "linkedin", pillar: "education", format: "text", idea: "Tip 1" },
  { day: 2, platform: "linkedin", pillar: "story", format: "image", idea: "Story" },
  { day: 99, platform: "linkedin", pillar: "x", format: "text", idea: "out of range" },
  { day: 3, platform: "tiktok", pillar: "x", format: "text", idea: "wrong platform" },
]);

const VOICE = { tone: ["bold"], themes: [], audience: "a", dos: [], donts: [] };

async function setup() {
  const clients = new ClientRepository(new FakeClientStore());
  const client = await clients.create({ agencyId: "ag1" }, { name: "Acme" });
  const brandProfiles = new FakeBrandProfileStore();
  await brandProfiles.upsert(client.id, { palette: [], fonts: [], voice: VOICE });
  const plans = new FakeContentPlanStore();
  const sink = new InMemoryAuditSink();
  const svc = new ContentPlannerService({
    llm: FakeLlmProvider.constant(PLAN_JSON),
    sink,
    model: "claude-sonnet-4-6",
    clients,
    brandProfiles,
    plans,
    clock: () => new Date("2026-06-08T00:00:00.000Z"),
  });
  return { svc, client, plans, sink };
}

describe("parsePlan", () => {
  it("keeps valid items, drops out-of-range days and wrong platforms", () => {
    const items = parsePlan(PLAN_JSON, 30, ["linkedin"]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.platform === "linkedin")).toBe(true);
  });

  it("throws when nothing usable is produced", () => {
    expect(() => parsePlan("[]", 30, ["linkedin"])).toThrow();
  });

  it("caps the number of items at days * platforms (anti-DoS)", () => {
    const many = JSON.stringify(
      Array.from({ length: 100 }, () => ({
        day: 1,
        platform: "linkedin",
        pillar: "p",
        format: "text",
        idea: "i",
      })),
    );
    expect(parsePlan(many, 2, ["linkedin"])).toHaveLength(2); // 2 days * 1 platform
  });
});

describe("ContentPlannerService.generate", () => {
  it("persists draft items scheduled by day and audits once", async () => {
    const { svc, client, plans, sink } = await setup();
    const result = await svc.generate({ agencyId: "ag1" }, { clientId: client.id, days: 30 });
    expect(result.items).toHaveLength(2);
    expect(plans.items).toHaveLength(2);
    const item2 = plans.items.find((i) => i.copy.brief.day === 2);
    expect(item2?.copy.brief.idea).toBe("Story");
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]!.action).toBe("content_plan");
  });

  it("requires a brand profile before planning", async () => {
    const clients = new ClientRepository(new FakeClientStore());
    const client = await clients.create({ agencyId: "ag1" }, { name: "NoBrand" });
    const svc = new ContentPlannerService({
      llm: FakeLlmProvider.constant(PLAN_JSON),
      sink: new InMemoryAuditSink(),
      model: "m",
      clients,
      brandProfiles: new FakeBrandProfileStore(),
      plans: new FakeContentPlanStore(),
    });
    await expect(
      svc.generate({ agencyId: "ag1" }, { clientId: client.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a client in another agency", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.generate({ agencyId: "intruder" }, { clientId: client.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("schedules day 1 on startDate and day 2 the next day (UTC)", async () => {
    const { svc, client, plans } = await setup();
    await svc.generate({ agencyId: "ag1" }, { clientId: client.id });
    const day1 = plans.items.find((i) => i.copy.brief.day === 1);
    const day2 = plans.items.find((i) => i.copy.brief.day === 2);
    expect(day1?.scheduledAt?.toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(day2?.scheduledAt?.toISOString()).toBe("2026-06-09T00:00:00.000Z");
  });

  it("injects a performance brief into the prompt when the learning loop is wired", async () => {
    const clients = new ClientRepository(new FakeClientStore());
    const client = await clients.create({ agencyId: "ag1" }, { name: "Acme" });
    const brandProfiles = new FakeBrandProfileStore();
    await brandProfiles.upsert(client.id, { palette: [], fonts: [], voice: VOICE });
    const llm = FakeLlmProvider.constant(PLAN_JSON);
    const svc = new ContentPlannerService({
      llm,
      sink: new InMemoryAuditSink(),
      model: "m",
      clients,
      brandProfiles,
      plans: new FakeContentPlanStore(),
      performance: {
        briefForClient: async () => ({
          topPillars: ["story"],
          topFormats: ["image"],
          highlights: [{ idea: "winner", platform: "linkedin", score: 99 }],
          sampleSize: 7,
        }),
      },
    });

    await svc.generate({ agencyId: "ag1" }, { clientId: client.id });

    const call = llm.calls[0]!;
    expect(call.messages[0]!.content).toContain("Past performance");
    expect(call.messages[0]!.content).toContain("winner");
    expect(call.opts?.system).toContain("PAST PERFORMANCE");
  });

  it("omits the performance section when the provider returns null", async () => {
    const clients = new ClientRepository(new FakeClientStore());
    const client = await clients.create({ agencyId: "ag1" }, { name: "Acme" });
    const brandProfiles = new FakeBrandProfileStore();
    await brandProfiles.upsert(client.id, { palette: [], fonts: [], voice: VOICE });
    const llm = FakeLlmProvider.constant(PLAN_JSON);
    const svc = new ContentPlannerService({
      llm,
      sink: new InMemoryAuditSink(),
      model: "m",
      clients,
      brandProfiles,
      plans: new FakeContentPlanStore(),
      performance: { briefForClient: async () => null }, // nothing measured yet
    });

    await svc.generate({ agencyId: "ag1" }, { clientId: client.id });

    const call = llm.calls[0]!;
    expect(call.messages[0]!.content).not.toContain("Past performance");
    expect(call.opts?.system).not.toContain("PAST PERFORMANCE");
  });

  it("planner output round-trips cleanly through the copy engine", async () => {
    const { svc, client, plans } = await setup();
    await svc.generate({ agencyId: "ag1" }, { clientId: client.id });
    const planned = plans.items[0]!; // { platform, brief } written by the planner

    const itemStore = new FakeContentItemStore();
    itemStore.seed({
      id: planned.id,
      agencyId: "ag1",
      clientId: planned.clientId,
      planId: planned.planId,
      copy: planned.copy,
    });
    const copyEngine = new CopyEngineService({
      llm: FakeLlmProvider.constant(COPY_JSON),
      sink: new InMemoryAuditSink(),
      model: "m",
      items: itemStore,
      brandProfiles: new FakeBrandProfileStore(),
    });

    const gen = await copyEngine.write({ agencyId: "ag1" }, planned.id);
    expect(gen.caption).toBe("c");
    const stored = await itemStore.findForAgency("ag1", planned.id);
    expect((stored!.copy as StoredCopy).generated?.caption).toBe("c");
  });
});
