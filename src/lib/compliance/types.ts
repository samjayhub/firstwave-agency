// Content safety & compliance gate (P4-09). Pre-approval checks — platform
// policy (caption/hashtag caps), agency banned terms, and ad/disclosure tags —
// surfaced as a structured report and enforced as an approval sub-step.

/** A blocking violation prevents approval; a warning is advisory only. */
export type Severity = "block" | "warn";

export interface Violation {
  /** Stable rule id (for clients to branch on): e.g. "banned_term". */
  rule: string;
  severity: Severity;
  /** Which part of the copy tripped it: "caption" | "hashtags" | "copy". */
  field: string;
  message: string;
}

export interface ComplianceReport {
  /** false when any block-severity violation is present. */
  ok: boolean;
  violations: Violation[];
}

/** Per-agency compliance configuration. An absent row == {@link defaultConfig}. */
export interface ComplianceConfig {
  /** When false the gate is a no-op (the agency has opted out). */
  enabled: boolean;
  /** Words/phrases that block approval if they appear in the copy. */
  bannedTerms: string[];
  /** When true, promotional posts must carry one of {@link disclosureTags}. */
  requireDisclosure: boolean;
  /** Tags that count as a valid ad disclosure (e.g. #ad, #sponsored). */
  disclosureTags: string[];
}

export interface ComplianceConfigPatch {
  enabled?: boolean;
  bannedTerms?: string[];
  requireDisclosure?: boolean;
  disclosureTags?: string[];
}

/** The text the rule engine inspects for a single item. */
export interface ComplianceInput {
  /** Target platforms — caption/hashtag caps differ per platform. */
  platforms: string[];
  caption: string;
  hook: string;
  hashtags: string[];
  description: string;
}

/** What the store loads for an item: its raw copy JSON + target platforms. */
export interface ComplianceItem {
  copy: unknown;
  platforms: string[];
}

export const DEFAULT_DISCLOSURE_TAGS = ["#ad", "#sponsored"];

export function defaultConfig(): ComplianceConfig {
  return {
    enabled: true,
    bannedTerms: [],
    requireDisclosure: false,
    disclosureTags: [...DEFAULT_DISCLOSURE_TAGS],
  };
}

/**
 * The narrow contract the approval paths depend on, so neither ApprovalService
 * nor ReviewService pulls in the whole compliance module — just this surface.
 */
export interface ComplianceGate {
  /** Throw a ValidationError if the item has any blocking violation. */
  assertApprovable(agencyId: string, itemId: string): Promise<void>;
}

/**
 * Persistence for the gate: the item to check (tenant-scoped) + per-agency
 * config. Implementations: in-memory fake, Prisma.
 */
export interface ComplianceStore {
  /** Load copy + target platforms for an item the agency owns; null if not. */
  loadItem(agencyId: string, itemId: string): Promise<ComplianceItem | null>;
  getConfig(agencyId: string): Promise<ComplianceConfig | null>;
  upsertConfig(agencyId: string, patch: ComplianceConfigPatch): Promise<ComplianceConfig>;
}
