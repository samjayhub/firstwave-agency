// The pure rule engine for the compliance gate. Given the copy + per-agency
// config it returns every violation it finds; the service layer enforces the
// blocking ones. Pure + deterministic so the policy is fully unit-testable.
//
// AUDIT-EXEMPT: rule-based (no LLM). The blocked-approval is the trail.
import type { ComplianceConfig, ComplianceInput, ComplianceReport, Violation } from "./types";

// Per-platform caption character caps (the platforms' documented maxes).
export const PLATFORM_CAPTION_LIMITS: Record<string, number> = {
  x: 280,
  pinterest: 500,
  meta_ig: 2200,
  tiktok: 2200,
  linkedin: 3000,
  youtube: 5000,
  meta_fb: 63206,
};

// Per-platform hashtag count caps, where the platform is strict about it.
export const PLATFORM_HASHTAG_LIMITS: Record<string, number> = {
  x: 10,
  youtube: 15,
  pinterest: 20,
  meta_ig: 30,
  tiktok: 30,
};

// Built-in signals that copy is promotional and ought to carry a disclosure.
// Disclosure forms (#ad/#sponsored) are deliberately absent — their presence is
// what satisfies the requirement, not what triggers it.
const PROMO_SIGNALS = [
  "paid partnership",
  "affiliate",
  "use code",
  "promo code",
  "discount code",
  "gifted",
  "brand ambassador",
];

/** Normalize a tag to its lowercased hashtag form (#ad, #sponsored). */
function normTag(tag: string): string {
  return `#${tag.replace(/^#+/, "")}`.toLowerCase();
}

/** All inspectable text, lowercased, with hashtags rendered as #tags. */
function buildCorpus(input: ComplianceInput): string {
  const tags = input.hashtags.map((h) => normTag(h)).join(" ");
  return [input.caption, input.hook, input.description, tags].join("\n").toLowerCase();
}

export function evaluate(input: ComplianceInput, config: ComplianceConfig): ComplianceReport {
  if (!config.enabled) return { ok: true, violations: [] };

  const violations: Violation[] = [];
  const corpus = buildCorpus(input);

  // 1. Empty caption — there is nothing to publish.
  if (input.caption.trim().length === 0) {
    violations.push({
      rule: "empty_caption",
      severity: "block",
      field: "caption",
      message: "Caption is empty; there is nothing to publish.",
    });
  }

  // 2. Platform policy — caption length + hashtag count caps.
  for (const platform of new Set(input.platforms)) {
    const capLimit = PLATFORM_CAPTION_LIMITS[platform];
    if (capLimit && input.caption.length > capLimit) {
      violations.push({
        rule: "caption_too_long",
        severity: "block",
        field: "caption",
        message: `Caption is ${input.caption.length} characters; ${platform} allows ${capLimit}.`,
      });
    }
    const tagLimit = PLATFORM_HASHTAG_LIMITS[platform];
    if (tagLimit && input.hashtags.length > tagLimit) {
      violations.push({
        rule: "too_many_hashtags",
        severity: "block",
        field: "hashtags",
        message: `${input.hashtags.length} hashtags exceed ${platform}'s limit of ${tagLimit}.`,
      });
    }
  }

  // 3. Agency banned terms.
  for (const term of config.bannedTerms) {
    const needle = term.trim().toLowerCase();
    if (needle && corpus.includes(needle)) {
      violations.push({
        rule: "banned_term",
        severity: "block",
        field: "copy",
        message: `Contains banned term "${term.trim()}".`,
      });
    }
  }

  // 4. Ad / disclosure tags.
  const hasDisclosure = config.disclosureTags.some((tag) => corpus.includes(normTag(tag)));
  if (config.requireDisclosure && !hasDisclosure) {
    violations.push({
      rule: "missing_disclosure",
      severity: "block",
      field: "hashtags",
      message: `Disclosure required: add one of ${config.disclosureTags.join(", ") || "#ad"}.`,
    });
  } else if (!hasDisclosure) {
    // Heuristic: looks promotional but carries no disclosure → advisory warning.
    const signal = PROMO_SIGNALS.find((s) => corpus.includes(s));
    if (signal) {
      violations.push({
        rule: "undisclosed_promo",
        severity: "warn",
        field: "copy",
        message: `Looks promotional ("${signal}") but has no disclosure tag — consider adding ${
          config.disclosureTags[0] ?? "#ad"
        }.`,
      });
    }
  }

  return { ok: !violations.some((v) => v.severity === "block"), violations };
}
