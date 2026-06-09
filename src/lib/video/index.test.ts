import { describe, it, expect } from "vitest";
import { VideoStudioService } from "./index";
import { FakeTtsProvider } from "./fakes/fake-tts-provider";
import { FakeVideoAssembler } from "./fakes/fake-video-assembler";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { FakeCreativeProvider } from "@/lib/creative/fake";
import { InMemoryAssetStorage } from "@/lib/creative/asset-storage";
import { InMemoryAuditSink } from "@/lib/audit";
import { FakeContentItemStore } from "@/lib/repositories/fakes/fake-content-stores";
import { FakeAssetRepository } from "@/lib/repositories/fakes/fake-asset-repository";
import { FakeBrandProfileStore } from "@/lib/brand-intel/fakes/fake-brand-intel";
import { NotFoundError, ValidationError, ExternalServiceError } from "@/lib/errors/app-error";
import type { StoredCopy } from "@/lib/content/types";

const SCRIPT_JSON = JSON.stringify({
  title: "Stop quitting at week 3",
  hook: "You start strong, then week three hits.",
  scenes: [
    { narration: "Motivation always fades — that's normal.", visual: "tired runner", caption: "Week 3" },
    { narration: "Systems beat willpower every time.", visual: "calendar with checkmarks" },
  ],
  cta: "Follow for the 3-system reset.",
});

const BRIEF = { day: 1, platform: "youtube", pillar: "habits", format: "short-video", idea: "5 gym tips" } as const;

function setup(
  opts: { copy?: StoredCopy; scriptJson?: string } = {},
) {
  const copy: StoredCopy = opts.copy ?? { platform: "youtube", brief: { ...BRIEF } };
  const items = new FakeContentItemStore();
  items.seed({ id: "item_1", agencyId: "ag1", clientId: "cl1", planId: "plan_1", copy });
  const brandProfiles = new FakeBrandProfileStore();
  void brandProfiles.upsert("cl1", {
    palette: [{ hex: "#0a1f44", role: "primary" }],
    fonts: [{ family: "Poppins", role: "heading" }],
    voice: { tone: ["confident", "warm"], themes: [], audience: "", dos: [], donts: [] },
  });
  const llm = FakeLlmProvider.constant(opts.scriptJson ?? SCRIPT_JSON);
  const broll = new FakeCreativeProvider();
  const tts = new FakeTtsProvider();
  const assembler = new FakeVideoAssembler();
  const storage = new InMemoryAssetStorage();
  const assets = new FakeAssetRepository();
  const sink = new InMemoryAuditSink();
  let n = 0;
  const svc = new VideoStudioService({
    llm,
    model: "claude-sonnet-4-6",
    tts,
    broll,
    assembler,
    storage,
    assets,
    items,
    brandProfiles,
    sink,
    idGen: () => `vid${++n}`,
  });
  return { svc, llm, broll, tts, assembler, storage, assets, sink };
}

describe("VideoStudioService.produceVideo", () => {
  it("runs script → B-roll → TTS → assembly and stores one video asset", async () => {
    const { svc, broll, tts, assembler, storage, assets } = setup();

    const asset = await svc.produceVideo({ agencyId: "ag1" }, "item_1", { targetSeconds: 40 });

    expect(asset.kind).toBe("video");
    expect(asset.source).toBe("generated");
    // One B-roll still per scene, one narration track, one assemble call.
    expect(broll.calls).toHaveLength(2);
    expect(tts.calls).toHaveLength(1);
    expect(assembler.calls).toHaveLength(1);
    // Narration is the hook + scenes + cta joined.
    expect(tts.calls[0]!.text).toContain("week three hits");
    expect(tts.calls[0]!.text).toContain("Follow for the 3-system reset.");
    // Clip durations follow the narration length (≈9s for this script at the
    // fake's 2.5 wps), NOT the 40s target — and are split proportionally.
    const clips = assembler.calls[0]!.clips;
    expect(clips).toHaveLength(2);
    const clipSum = clips.reduce((s, c) => s + c.durationSec, 0);
    expect(clipSum).toBeGreaterThan(4); // above the 2×2s per-clip floor
    expect(clipSum).toBeLessThan(20); // sized to narration, not the 40s target
    expect(clips[0]!.durationSec).toBeGreaterThan(clips[1]!.durationSec);
    expect(clips[0]!.caption).toBe("Week 3");
    // Brand palette flows into the assembler.
    expect(assembler.calls[0]!.style.palette).toEqual(["#0a1f44"]);
    // Bytes were stored under the tenant-scoped key and the row points at them.
    expect(asset.url).toBe("memory://cl1/item_1/vid1.mp4");
    expect(storage.objects.has("cl1/item_1/vid1.mp4")).toBe(true);
    expect((await assets.listForItem("ag1", "item_1"))).toHaveLength(1);
  });

  it("passes the brand voice cue into the script prompt", async () => {
    const { svc, llm } = setup();
    await svc.produceVideo({ agencyId: "ag1" }, "item_1");
    expect(llm.calls[0]!.messages[0]!.content).toContain("Brand voice: confident, warm");
  });

  it("audits the script, each B-roll, and the narration", async () => {
    const { svc, sink } = setup();
    await svc.produceVideo({ agencyId: "ag1" }, "item_1");

    const actions = sink.records.map((r) => r.action);
    expect(actions.filter((a) => a === "video_script")).toHaveLength(1);
    expect(actions.filter((a) => a === "image_generation")).toHaveLength(2);
    expect(actions.filter((a) => a === "tts_generation")).toHaveLength(1);
    expect(sink.records.every((r) => r.status === "success")).toBe(true);
  });

  it("uses an explicit pain point + clamps the target length", async () => {
    const { svc, llm } = setup();
    await svc.produceVideo({ agencyId: "ag1" }, "item_1", {
      painPoint: "My ads don't convert",
      targetSeconds: 9999,
    });
    expect(llm.calls[0]!.messages[0]!.content).toContain("Pain point: My ads don't convert");
    // 9999 clamped to the 180s ceiling.
    expect(llm.calls[0]!.messages[0]!.content).toContain("180 seconds");
  });

  it("rejects an unknown item with NotFound and records nothing", async () => {
    const { svc, sink } = setup();
    await expect(svc.produceVideo({ agencyId: "ag1" }, "nope")).rejects.toBeInstanceOf(NotFoundError);
    // Cross-tenant access is also NotFound.
    await expect(svc.produceVideo({ agencyId: "other" }, "item_1")).rejects.toBeInstanceOf(NotFoundError);
    expect(sink.records).toHaveLength(0);
  });

  it("requires a pain point when the item has no planned idea", async () => {
    const { svc } = setup({ copy: { platform: "youtube", brief: { ...BRIEF, idea: "" } } });
    await expect(svc.produceVideo({ agencyId: "ag1" }, "item_1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("records an error audit when the script fails schema validation", async () => {
    const { svc, sink, broll } = setup({ scriptJson: "not json" });
    await expect(svc.produceVideo({ agencyId: "ag1" }, "item_1")).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    const scriptRecord = sink.records.find((r) => r.action === "video_script");
    expect(scriptRecord?.status).toBe("error");
    // Pipeline aborts before any B-roll is drawn.
    expect(broll.calls).toHaveLength(0);
  });

  it("lists only video assets for an item", async () => {
    const { svc, assets } = setup();
    await assets.create("ag1", {
      contentItemId: "item_1",
      kind: "image",
      url: "memory://x.png",
      source: "generated",
    });
    await svc.produceVideo({ agencyId: "ag1" }, "item_1");
    const videos = await svc.listForItem({ agencyId: "ag1" }, "item_1");
    expect(videos).toHaveLength(1);
    expect(videos[0]!.kind).toBe("video");
  });
});
