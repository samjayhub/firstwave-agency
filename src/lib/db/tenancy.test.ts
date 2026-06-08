import { describe, it, expect } from "vitest";
import {
  TENANT_SCOPED_MODELS,
  assertAgencyId,
  scopedWhere,
} from "./tenancy";

describe("assertAgencyId", () => {
  it("returns a valid id and rejects empty / missing", () => {
    expect(assertAgencyId("ag1")).toBe("ag1");
    expect(() => assertAgencyId("")).toThrow();
    expect(() => assertAgencyId(undefined)).toThrow();
    expect(() => assertAgencyId(null)).toThrow();
  });
});

describe("scopedWhere", () => {
  it("injects the agency scope", () => {
    expect(scopedWhere("ag1")).toEqual({ agencyId: "ag1" });
    expect(scopedWhere("ag1", { niche: "fitness" })).toEqual({
      niche: "fitness",
      agencyId: "ag1",
    });
  });

  it("does not let a caller override the agency scope", () => {
    // The agencyId is applied last, so a hostile filter can't widen the scope.
    const where = scopedWhere("ag1", { agencyId: "ag2" } as { agencyId: string });
    expect(where.agencyId).toBe("ag1");
  });
});

describe("TENANT_SCOPED_MODELS registry", () => {
  it("registers every tenant-owned model with a binding strategy", () => {
    // Adapted 3-step rule: new tenant models must appear here.
    expect(TENANT_SCOPED_MODELS.Client).toBe("direct");
    expect(TENANT_SCOPED_MODELS.AiAuditLog).toBe("direct");
    expect(TENANT_SCOPED_MODELS.ContentItem).toBe("via-plan");
    // Sanity: no model is registered with an unknown strategy.
    const valid = new Set(["direct", "via-client", "via-plan", "via-item", "via-job"]);
    for (const strategy of Object.values(TENANT_SCOPED_MODELS)) {
      expect(valid.has(strategy)).toBe(true);
    }
  });
});
