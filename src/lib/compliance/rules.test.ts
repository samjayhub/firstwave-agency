import { describe, it, expect } from "vitest";
import { evaluate } from "./rules";
import { defaultConfig, type ComplianceInput } from "./types";

function input(over: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    platforms: ["linkedin"],
    caption: "A clean, on-brand post about our launch.",
    hook: "Big news today.",
    hashtags: ["launch", "news"],
    description: "Longer-form description.",
    ...over,
  };
}

describe("compliance evaluate", () => {
  it("passes clean copy", () => {
    const report = evaluate(input(), defaultConfig());
    expect(report.ok).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("is a no-op when disabled", () => {
    const report = evaluate(input({ caption: "x".repeat(1000), platforms: ["x"] }), {
      ...defaultConfig(),
      enabled: false,
    });
    expect(report.ok).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("blocks a caption over the platform limit", () => {
    const report = evaluate(input({ platforms: ["x"], caption: "y".repeat(281) }), defaultConfig());
    expect(report.ok).toBe(false);
    expect(report.violations.find((v) => v.rule === "caption_too_long")?.severity).toBe("block");
  });

  it("blocks too many hashtags for the platform", () => {
    const report = evaluate(
      input({ platforms: ["x"], hashtags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
      defaultConfig(),
    );
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.rule === "too_many_hashtags")).toBe(true);
  });

  it("blocks an empty caption", () => {
    const report = evaluate(input({ caption: "   " }), defaultConfig());
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.rule === "empty_caption")).toBe(true);
  });

  it("blocks a configured banned term (case-insensitive)", () => {
    const report = evaluate(input({ caption: "Guaranteed RESULTS, no risk!" }), {
      ...defaultConfig(),
      bannedTerms: ["guaranteed results"],
    });
    expect(report.ok).toBe(false);
    const v = report.violations.find((x) => x.rule === "banned_term");
    expect(v?.message).toContain("guaranteed results");
  });

  it("blocks a required-but-missing disclosure", () => {
    const report = evaluate(input(), { ...defaultConfig(), requireDisclosure: true });
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.rule === "missing_disclosure")).toBe(true);
  });

  it("accepts a disclosure tag when one is required", () => {
    const report = evaluate(input({ hashtags: ["launch", "ad"] }), {
      ...defaultConfig(),
      requireDisclosure: true,
    });
    expect(report.ok).toBe(true);
  });

  it("warns (does not block) on promo language without a disclosure", () => {
    const report = evaluate(
      input({ caption: "Thanks to our paid partnership with Acme!" }),
      defaultConfig(),
    );
    expect(report.ok).toBe(true);
    const v = report.violations.find((x) => x.rule === "undisclosed_promo");
    expect(v?.severity).toBe("warn");
  });
});
