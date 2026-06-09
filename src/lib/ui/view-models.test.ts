import { describe, expect, it } from "vitest";
import {
  approvalSummary,
  availableActions,
  formatDate,
  itemHeadline,
  STATUS_META,
} from "./view-models";

describe("approvalSummary", () => {
  it("tallies items by status and surfaces the pending-review count", () => {
    const s = approvalSummary([
      { status: "draft" },
      { status: "in_review" },
      { status: "in_review" },
      { status: "published" },
    ]);
    expect(s.total).toBe(4);
    expect(s.counts.in_review).toBe(2);
    expect(s.counts.published).toBe(1);
    expect(s.pendingReview).toBe(2);
  });

  it("returns zeroed counts for an empty queue", () => {
    const s = approvalSummary([]);
    expect(s.total).toBe(0);
    expect(s.pendingReview).toBe(0);
    expect(Object.values(s.counts).every((n) => n === 0)).toBe(true);
  });
});

describe("availableActions", () => {
  it("offers submit from draft", () => {
    expect(availableActions("draft").map((a) => a.action)).toEqual(["submit"]);
  });
  it("offers approve + reject from in_review", () => {
    expect(availableActions("in_review").map((a) => a.action)).toEqual(["approve", "reject"]);
  });
  it("offers nothing for terminal/automated states", () => {
    expect(availableActions("published")).toEqual([]);
    expect(availableActions("scheduled")).toEqual([]);
  });
});

describe("itemHeadline", () => {
  it("prefers the plan idea", () => {
    expect(itemHeadline({ brief: { idea: "Launch teaser" } })).toBe("Launch teaser");
  });
  it("falls back to the generated caption", () => {
    expect(itemHeadline({ generated: { caption: "Big news today" } })).toBe("Big news today");
  });
  it("handles missing/garbage copy", () => {
    expect(itemHeadline(null)).toBe("Untitled item");
    expect(itemHeadline({ brief: {} })).toBe("Untitled item");
    expect(itemHeadline("nope")).toBe("Untitled item");
  });
});

describe("formatDate", () => {
  it("formats a date to YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-06-09T12:00:00Z"))).toBe("2026-06-09");
    expect(formatDate("2026-01-02T00:00:00Z")).toBe("2026-01-02");
  });
  it("shows an em dash for null/invalid", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("STATUS_META", () => {
  it("has a label + tone for every status", () => {
    for (const meta of Object.values(STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.tone).toBeTruthy();
    }
  });
});
