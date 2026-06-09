import { describe, it, expect, beforeEach } from "vitest";
import { ComplianceService } from "./index";
import { FakeComplianceStore } from "./fakes";

const ITEM = "item_1";
const AGENCY = "ag1";

function storedCopy(over: Record<string, unknown> = {}) {
  return {
    platform: "linkedin",
    brief: { day: 1, platform: "linkedin", pillar: "p", format: "text", idea: "i" },
    generated: {
      caption: "A clean, on-brand post.",
      hook: "Hook.",
      hashtags: ["launch"],
      description: "Desc.",
      ...over,
    },
  };
}

describe("ComplianceService", () => {
  let store: FakeComplianceStore;
  let svc: ComplianceService;

  beforeEach(() => {
    store = new FakeComplianceStore();
    svc = new ComplianceService({ store });
  });

  it("evaluates a clean item as ok and assertApprovable passes", async () => {
    store.seedItem(AGENCY, ITEM, { copy: storedCopy(), platforms: ["linkedin"] });
    const report = await svc.evaluateItem({ agencyId: AGENCY }, ITEM);
    expect(report.ok).toBe(true);
    await expect(svc.assertApprovable(AGENCY, ITEM)).resolves.toBeUndefined();
  });

  it("blocks approval on a banned term", async () => {
    store.seedItem(AGENCY, ITEM, {
      copy: storedCopy({ caption: "Miracle cure inside!" }),
      platforms: ["linkedin"],
    });
    store.seedConfig(AGENCY, { bannedTerms: ["miracle cure"] });
    await expect(svc.assertApprovable(AGENCY, ITEM)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("does not enforce when the gate is disabled", async () => {
    store.seedItem(AGENCY, ITEM, {
      copy: storedCopy({ caption: "Miracle cure inside!" }),
      platforms: ["linkedin"],
    });
    store.seedConfig(AGENCY, { enabled: false, bannedTerms: ["miracle cure"] });
    const report = await svc.evaluateItem({ agencyId: AGENCY }, ITEM);
    expect(report.ok).toBe(true);
    await expect(svc.assertApprovable(AGENCY, ITEM)).resolves.toBeUndefined();
  });

  it("treats an item with no generated copy as not-yet-checkable (warn, not block)", async () => {
    store.seedItem(AGENCY, ITEM, {
      copy: { platform: "linkedin", brief: {} },
      platforms: ["linkedin"],
    });
    const report = await svc.evaluateItem({ agencyId: AGENCY }, ITEM);
    expect(report.ok).toBe(true);
    expect(report.violations[0]?.rule).toBe("no_copy");
    await expect(svc.assertApprovable(AGENCY, ITEM)).resolves.toBeUndefined();
  });

  it("merges target platforms with the copy's own platform for caps", async () => {
    // Caption fits LinkedIn (3000) but not X (280); a connected X target must trip it.
    store.seedItem(AGENCY, ITEM, {
      copy: storedCopy({ caption: "z".repeat(500) }),
      platforms: ["x"],
    });
    const report = await svc.evaluateItem({ agencyId: AGENCY }, ITEM);
    expect(report.violations.some((v) => v.rule === "caption_too_long")).toBe(true);
  });

  it("refuses an item in another agency (NotFound)", async () => {
    store.seedItem(AGENCY, ITEM, { copy: storedCopy(), platforms: ["linkedin"] });
    await expect(svc.evaluateItem({ agencyId: "intruder" }, ITEM)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("round-trips settings through the store", async () => {
    const updated = await svc.updateSettings({ agencyId: AGENCY }, { bannedTerms: ["foo"] });
    expect(updated.bannedTerms).toEqual(["foo"]);
    const got = await svc.getSettings({ agencyId: AGENCY });
    expect(got.bannedTerms).toEqual(["foo"]);
  });

  it("returns defaults when no settings row exists", async () => {
    const got = await svc.getSettings({ agencyId: AGENCY });
    expect(got).toMatchObject({ enabled: true, requireDisclosure: false });
  });
});
