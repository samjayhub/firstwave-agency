import { describe, it, expect } from "vitest";
import { CopyEngineService, parseGeneratedCopy } from "./index";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { FakeContentItemStore } from "@/lib/repositories/fakes/fake-content-stores";
import { FakeBrandProfileStore } from "@/lib/brand-intel/fakes/fake-brand-intel";
import type { StoredCopy } from "@/lib/content/types";

const COPY_JSON = JSON.stringify({
  caption: "Big caption",
  hook: "Stop scrolling",
  hashtags: ["fitness", "habits"],
  description: "Long-form variant",
});

const BRIEF = { day: 1, platform: "linkedin", pillar: "edu", format: "text", idea: "Tip" } as const;

function setup() {
  const items = new FakeContentItemStore();
  items.seed({
    id: "item_1",
    agencyId: "ag1",
    clientId: "cl1",
    planId: "plan_1",
    copy: { platform: "linkedin", brief: { ...BRIEF } },
  });
  const brandProfiles = new FakeBrandProfileStore();
  const sink = new InMemoryAuditSink();
  const svc = new CopyEngineService({
    llm: FakeLlmProvider.constant(COPY_JSON),
    sink,
    model: "claude-sonnet-4-6",
    items,
    brandProfiles,
  });
  return { svc, items, sink };
}

describe("parseGeneratedCopy", () => {
  it("validates the copy object", () => {
    expect(parseGeneratedCopy(COPY_JSON).hook).toBe("Stop scrolling");
  });
  it("rejects copy missing required fields", () => {
    expect(() => parseGeneratedCopy(JSON.stringify({ caption: "" }))).toThrow();
  });
});

describe("CopyEngineService.write", () => {
  it("generates copy, persists it on the item, and audits once", async () => {
    const { svc, items, sink } = setup();
    const gen = await svc.write({ agencyId: "ag1" }, "item_1");
    expect(gen.caption).toBe("Big caption");
    const stored = await items.findForAgency("ag1", "item_1");
    expect((stored!.copy as StoredCopy).generated?.hook).toBe("Stop scrolling");
    expect(sink.records[0]!.action).toBe("copy_generation");
  });

  it("refuses an item in another agency", async () => {
    const { svc } = setup();
    await expect(svc.write({ agencyId: "intruder" }, "item_1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("errors when the item has no plan brief", async () => {
    const items = new FakeContentItemStore();
    items.seed({
      id: "item_2",
      agencyId: "ag1",
      clientId: "cl1",
      planId: "p",
      copy: {} as unknown as StoredCopy,
    });
    const svc = new CopyEngineService({
      llm: FakeLlmProvider.constant(COPY_JSON),
      sink: new InMemoryAuditSink(),
      model: "m",
      items,
      brandProfiles: new FakeBrandProfileStore(),
    });
    await expect(svc.write({ agencyId: "ag1" }, "item_2")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
