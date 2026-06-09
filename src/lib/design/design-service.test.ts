import { describe, it, expect } from "vitest";
import { DesignDirectorService } from "./index";
import {
  parseArtDirection,
  parseDesignColors,
  parseDesignCopy,
  parseDesignImagery,
} from "./specialists";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { FakeBrandProfileStore } from "@/lib/brand-intel/fakes/fake-brand-intel";
import type { DesignItemRecord, DesignItemStore, DesignSpec } from "./types";

// Minimal in-memory item store faithful to the tenant-scoped contract.
class FakeDesignItemStore implements DesignItemStore {
  private rows = new Map<string, { agencyId: string } & DesignItemRecord>();
  specs = new Map<string, DesignSpec>();
  seed(row: { agencyId: string } & DesignItemRecord) {
    this.rows.set(row.id, row);
  }
  async findForAgency(agencyId: string, itemId: string) {
    const r = this.rows.get(itemId);
    if (!r || r.agencyId !== agencyId) return null;
    return { id: r.id, clientId: r.clientId, copy: r.copy };
  }
  async saveSpec(agencyId: string, itemId: string, spec: DesignSpec) {
    const r = this.rows.get(itemId);
    if (!r || r.agencyId !== agencyId) return false;
    this.specs.set(itemId, spec);
    return true;
  }
}

const BRIEF = { day: 1, platform: "instagram", pillar: "edu", format: "image", idea: "Morning habits" };

function responder() {
  return new FakeLlmProvider((_messages, opts) => {
    const sys = opts?.system ?? "";
    if (sys.includes("art director"))
      return JSON.stringify({ concept: "Bold minimalism", mood: ["clean", "bold"], composition: "centered hero" });
    if (sys.includes("copywriter"))
      return JSON.stringify({ headline: "Do more", subheadline: "Every day", cta: "Start now" });
    if (sys.includes("colour specialist"))
      return JSON.stringify({ background: "#FFFFFF", foreground: "#111111", accent: "#4F46E5" });
    if (sys.includes("imagery specialist"))
      return JSON.stringify({ imagePrompt: "a sunrise over mountains, cinematic" });
    return "{}";
  });
}

function setup() {
  const items = new FakeDesignItemStore();
  items.seed({
    agencyId: "ag1",
    id: "item_1",
    clientId: "cl1",
    copy: { platform: "instagram", brief: { ...BRIEF } },
  });
  const llm = responder();
  const sink = new InMemoryAuditSink();
  const svc = new DesignDirectorService({
    llm,
    sink,
    model: "claude-sonnet-4-6",
    items,
    brandProfiles: new FakeBrandProfileStore(),
  });
  return { svc, items, sink, llm };
}

describe("specialist parsers", () => {
  it("parse the four specialist outputs", () => {
    expect(parseArtDirection('{"concept":"c","mood":["m"],"composition":"x"}').concept).toBe("c");
    expect(parseDesignCopy('{"headline":"h","subheadline":"s","cta":"c"}').headline).toBe("h");
    expect(parseDesignColors('{"background":"#000","foreground":"#fff","accent":"#abc"}').accent).toBe("#abc");
    expect(parseDesignImagery('{"imagePrompt":"p"}')).toBe("p");
  });

  it("rejects a non-hex colour", () => {
    expect(() => parseDesignColors('{"background":"red","foreground":"#fff","accent":"#abc"}')).toThrow();
  });

  it("rejects art direction missing a mood", () => {
    expect(() => parseArtDirection('{"concept":"c","mood":[],"composition":"x"}')).toThrow();
  });
});

describe("DesignDirectorService.design", () => {
  it("orchestrates the specialists into one spec and persists it", async () => {
    const { svc, items } = setup();
    const spec = await svc.design({ agencyId: "ag1" }, "item_1");
    expect(spec.concept).toBe("Bold minimalism");
    expect(spec.copy.headline).toBe("Do more");
    expect(spec.colors.accent).toBe("#4F46E5");
    expect(spec.imagePrompt).toContain("sunrise");
    expect(spec.model).toBe("claude-sonnet-4-6");
    expect(items.specs.get("item_1")).toEqual(spec);
  });

  it("writes one audit row per specialist agent (4 total)", async () => {
    const { svc, sink } = setup();
    await svc.design({ agencyId: "ag1" }, "item_1");
    const actions = sink.records.map((r) => r.action).sort();
    expect(actions).toEqual(["design_color", "design_copy", "design_direction", "design_imagery"]);
  });

  it("feeds the art direction to the downstream specialists", async () => {
    const { svc, llm } = setup();
    await svc.design({ agencyId: "ag1" }, "item_1");
    const copyCall = llm.calls.find((c) => (c.opts?.system ?? "").includes("copywriter"));
    expect(copyCall!.messages[0]!.content).toContain("Bold minimalism");
  });

  it("refuses an item in another agency", async () => {
    const { svc } = setup();
    await expect(svc.design({ agencyId: "intruder" }, "item_1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects an item with no plan brief", async () => {
    const { svc, items } = setup();
    items.seed({ agencyId: "ag1", id: "item_2", clientId: "cl1", copy: { platform: "instagram" } });
    await expect(svc.design({ agencyId: "ag1" }, "item_2")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
