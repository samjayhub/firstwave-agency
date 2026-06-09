// Content safety & compliance gate (P4-09). Runs the pure rule engine against an
// item's copy + the agency's config, exposes the report for the dashboard, and
// enforces the blocking violations as an approval sub-step (the ComplianceGate
// the approval + reviewer paths call before flipping an item to `approved`).
//
// AUDIT-EXEMPT: rule-based (non-LLM). A blocked approval is the trail.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { evaluate } from "./rules";
import {
  defaultConfig,
  type ComplianceConfig,
  type ComplianceConfigPatch,
  type ComplianceGate,
  type ComplianceInput,
  type ComplianceItem,
  type ComplianceReport,
  type ComplianceStore,
} from "./types";

export * from "./types";
export { evaluate, PLATFORM_CAPTION_LIMITS, PLATFORM_HASHTAG_LIMITS } from "./rules";

export interface ComplianceServiceDeps {
  store: ComplianceStore;
}

// The persisted ContentItem.copy shape we care about (a tolerant subset of
// StoredCopy — the generated copy may not exist yet).
const StoredCopySchema = z
  .object({
    platform: z.string().optional(),
    generated: z
      .object({
        caption: z.string().default(""),
        hook: z.string().default(""),
        hashtags: z.array(z.string()).default([]),
        description: z.string().default(""),
      })
      .optional(),
  })
  .passthrough();

export class ComplianceService implements ComplianceGate {
  constructor(private readonly deps: ComplianceServiceDeps) {}

  /** Evaluate one item and return the full report (warnings included). */
  async evaluateItem(ctx: TenantContext, itemId: string): Promise<ComplianceReport> {
    const item = await this.deps.store.loadItem(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");
    const config = (await this.deps.store.getConfig(ctx.agencyId)) ?? defaultConfig();
    if (!config.enabled) return { ok: true, violations: [] };

    const input = toInput(item);
    // Nothing to check until copy has been generated — don't block on its absence.
    if (!input) {
      return {
        ok: true,
        violations: [
          {
            rule: "no_copy",
            severity: "warn",
            field: "copy",
            message: "No generated copy to check yet.",
          },
        ],
      };
    }
    return evaluate(input, config);
  }

  /** Gate hook: throw if the item has any blocking violation. */
  async assertApprovable(agencyId: string, itemId: string): Promise<void> {
    const report = await this.evaluateItem({ agencyId }, itemId);
    if (report.ok) return;
    const blocks = report.violations.filter((v) => v.severity === "block");
    throw new ValidationError(
      `Blocked by compliance: ${blocks.map((v) => v.message).join(" ")}`,
      { details: { violations: report.violations } },
    );
  }

  getSettings(ctx: TenantContext): Promise<ComplianceConfig> {
    return this.deps.store
      .getConfig(ctx.agencyId)
      .then((c) => c ?? defaultConfig());
  }

  updateSettings(ctx: TenantContext, patch: ComplianceConfigPatch): Promise<ComplianceConfig> {
    return this.deps.store.upsertConfig(ctx.agencyId, patch);
  }
}

/** Pull the inspectable copy fields + merged platforms out of a stored item. */
function toInput(item: ComplianceItem): ComplianceInput | null {
  const parsed = StoredCopySchema.safeParse(item.copy);
  const generated = parsed.success ? parsed.data.generated : undefined;
  if (!generated) return null;

  const own = parsed.success && parsed.data.platform ? [parsed.data.platform] : [];
  return {
    platforms: [...new Set([...own, ...item.platforms])],
    caption: generated.caption,
    hook: generated.hook,
    hashtags: generated.hashtags,
    description: generated.description,
  };
}
