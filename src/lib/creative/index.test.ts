import { describe, it, expect } from "vitest";
import { CreativeStudioService } from "./index";
import { FakeCreativeProvider } from "./fake";
import { InMemoryAssetStorage } from "./asset-storage";
import { InMemoryAuditSink } from "@/lib/audit";
import { FakeContentItemStore } from "@/lib/repositories/fakes/fake-content-stores";
import { FakeAssetRepository } from "@/lib/repositories/fakes/fake-asset-repository";
import { FakeBrandProfileStore } from "@/lib/brand-intel/fakes/fake-brand-intel";
import type { StoredCopy } from "@/lib/content/types";

const BRIEF = { day: 1, platform: "linkedin", pillar: "edu", format: "flyer", idea: "5 gym tips" } as const;

function setup(copy: StoredCopy = { platform: "linkedin", brief: { ...BRIEF } }) {
  const items = new FakeContentItemStore();
  items.seed({ id: "item_1", agencyId: "ag1", clientId: "cl1", planId: "plan_1", copy });
  const brandProfiles = new FakeBrandProfileStore();
  void brandProfiles.upsert("cl1", {
    palette: [{ hex: "#0a1f44", role: "primary" }],
    fonts: [{ family: "Poppins", role: "heading" }],
    voice: { tone: [], themes: [], audience: "", dos: [], donts: [] },
  });
  const provider = new FakeCreativeProvider();
  const storage = new InMemoryAssetStorage();
  const assets = new FakeAssetRepository();
  const sink = new InMemoryAuditSink();
  const svc = new CreativeStudioService({
    provider,
    storage,
    assets,
    items,
    brandProfiles,
    sink,
    idGen: () => "fixedid",
  });
  return { svc, provider, storage, assets, sink };
}

describe("CreativeStudioService.generateImage", () => {
  it("generates, stores bytes, records an Asset, and audits once", async () => {
    const { svc, provider, storage, assets, sink } = setup();
    const asset = await svc.generateImage({ agencyId: "ag1" }, "item_1");

    expect(asset.kind).toBe("image");
    expect(asset.url).toBe("memory://cl1/item_1/fixedid.png");
    expect(storage.objects.has("cl1/item_1/fixedid.png")).toBe(true);
    // flyer format → legible-text routing
    expect(provider.calls[0]!.needsLegibleText).toBe(true);
    expect(provider.calls[0]!.style.palette).toContain("#0a1f44");
    expect(await assets.listForItem("ag1", "item_1")).toHaveLength(1);
    expect(sink.records[0]!.action).toBe("image_generation");
  });

  it("uses a prompt override when provided", async () => {
    const { svc, provider } = setup();
    await svc.generateImage({ agencyId: "ag1" }, "item_1", "Custom hero shot");
    expect(provider.calls[0]!.prompt).toBe("Custom hero shot");
  });

  it("refuses an item in another agency", async () => {
    const { svc } = setup();
    await expect(svc.generateImage({ agencyId: "intruder" }, "item_1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("errors when there is no prompt and no brief idea", async () => {
    const { svc } = setup({ platform: "linkedin", brief: undefined as never });
    await expect(svc.generateImage({ agencyId: "ag1" }, "item_1")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
