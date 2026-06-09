// Content Planner — the LLM builds an N-day calendar grounded in the client's
// BrandProfile voice. Output is validated, then persisted as a ContentPlan plus
// draft ContentItem rows. Every LLM call is audited.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonArray } from "@/lib/llm/json";
import { ExternalServiceError, ValidationError } from "@/lib/errors/app-error";
import { ClientRepository } from "@/lib/repositories/client-repository";
import type { BrandProfileStore } from "@/lib/brand-intel";
import type { Platform } from "@/lib/publishers/types";
import { PLAN_PLATFORMS, type PlanItemBrief, type StoredCopy } from "@/lib/content/types";
import type { PerformanceProvider } from "@/lib/performance/types";

export interface PlanInput {
  clientId: string;
  days?: number; // default 30, clamped 1..60
  platforms?: Platform[]; // default ["linkedin"]
  startDate?: Date;
}

export interface NewPlanItem {
  scheduledAt: Date;
  copy: StoredCopy;
}

export interface ContentPlanResult {
  planId: string;
  items: Array<{ contentItemId: string; brief: PlanItemBrief }>;
}

// Isolation is enforced in the query predicate (agencyId), not via a prior read —
// consistent with the rest of the repository layer.
export interface ContentPlanStore {
  createPlanWithItems(
    agencyId: string,
    clientId: string,
    startDate: Date,
    items: NewPlanItem[],
  ): Promise<ContentPlanResult>;
  latestForClient(
    agencyId: string,
    clientId: string,
  ): Promise<{ planId: string; startDate: Date; items: Array<{ contentItemId: string; copy: StoredCopy | null }> } | null>;
}

export interface ContentPlannerDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  clients: ClientRepository;
  brandProfiles: BrandProfileStore;
  plans: ContentPlanStore;
  /** Optional learning loop (P4-02): grounds the plan in past performance. */
  performance?: PerformanceProvider;
  clock?: () => Date;
}

const PlanItemSchema = z.object({
  day: z.number().int().min(1),
  platform: z.string(),
  pillar: z.string().min(1),
  format: z.string().min(1),
  idea: z.string().min(1),
});

function clampDays(days: number | undefined): number {
  const n = days ?? 30;
  if (!Number.isInteger(n) || n < 1) return 30;
  return Math.min(n, 60);
}

function addDays(start: Date, days: number): Date {
  const d = new Date(start.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Validate + normalize the model's plan against the requested window/platforms. */
export function parsePlan(
  raw: string,
  days: number,
  platforms: Platform[],
): PlanItemBrief[] {
  const allowed = new Set<string>(platforms);
  // Hard upper bound so a runaway model can't create an unbounded number of rows.
  const maxItems = days * platforms.length;
  const items: PlanItemBrief[] = [];
  for (const entry of extractJsonArray(raw)) {
    if (items.length >= maxItems) break;
    const parsed = PlanItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const { day, platform, pillar, format, idea } = parsed.data;
    if (day > days || !allowed.has(platform)) continue;
    items.push({ day, platform: platform as Platform, pillar, format, idea });
  }
  if (items.length === 0) {
    throw new ExternalServiceError("Content plan generation produced no usable items");
  }
  return items;
}

function systemPrompt(days: number, platforms: Platform[], hasPerformance: boolean): string {
  return [
    `You are a social media strategist creating a ${days}-day content plan.`,
    `Plan only for these platforms: ${platforms.join(", ")}.`,
    "Ground every idea in the brand voice provided by the user.",
    ...(hasPerformance
      ? [
          "The user also provides this client's PAST PERFORMANCE. Lean into the",
          "pillars and formats that performed best and build on the strongest",
          "ideas; do not simply repeat them verbatim. Avoid angles that did not land.",
        ]
      : []),
    "Respond with ONLY a JSON array, no prose, no code fences. Each element:",
    '{"day":<1-' + days + '>,"platform":"<one of the platforms>","pillar":"<theme>","format":"<text|image|carousel|short-video>","idea":"<one-line idea>"}',
    "Spread posts sensibly across the days and platforms.",
  ].join("\n");
}

export class ContentPlannerService {
  private readonly clock: () => Date;
  constructor(private readonly deps: ContentPlannerDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async generate(ctx: TenantContext, input: PlanInput): Promise<ContentPlanResult> {
    await this.deps.clients.get(ctx, input.clientId); // ownership

    const profile = await this.deps.brandProfiles.findByClient(input.clientId);
    if (!profile) {
      throw new ValidationError("Extract a brand profile for this client before planning");
    }

    const days = clampDays(input.days);
    const platforms =
      input.platforms && input.platforms.length > 0 ? input.platforms : (["linkedin"] as Platform[]);
    // Defensive: only platforms the MVP supports.
    const safePlatforms = platforms.filter((p) => PLAN_PLATFORMS.includes(p));
    if (safePlatforms.length === 0) {
      throw new ValidationError("No supported platforms requested");
    }

    // Learning loop (P4-02): ground the plan in what performed, when available.
    const performance = this.deps.performance
      ? await this.deps.performance.briefForClient(ctx.agencyId, input.clientId)
      : null;

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: input.clientId,
      action: "content_plan",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary:
        `${days}-day plan for ${safePlatforms.join(", ")}` +
        (performance ? ` (learning from ${performance.sampleSize} past posts)` : ""),
    };

    const userContent =
      `Brand voice:\n${JSON.stringify(profile.voice)}` +
      (performance ? `\n\nPast performance (favor what worked):\n${JSON.stringify(performance)}` : "");

    const briefs = await withAudit(this.deps.sink, meta, async () => {
      const raw = await this.deps.llm.complete(
        [{ role: "user", content: userContent }],
        { system: systemPrompt(days, safePlatforms, performance !== null), maxTokens: 4096 },
      );
      const parsed = parsePlan(raw, days, safePlatforms);
      return { result: parsed, outputSummary: `${parsed.length} plan items` };
    });

    // Normalize to UTC midnight so a 30-day calendar lands on day boundaries.
    const startDate = input.startDate ?? startOfUtcDay(this.clock());
    const items: NewPlanItem[] = briefs.map((brief) => ({
      scheduledAt: addDays(startDate, brief.day - 1),
      copy: { platform: brief.platform, brief },
    }));

    return this.deps.plans.createPlanWithItems(ctx.agencyId, input.clientId, startDate, items);
  }

  async latest(ctx: TenantContext, clientId: string) {
    await this.deps.clients.get(ctx, clientId);
    return this.deps.plans.latestForClient(ctx.agencyId, clientId);
  }
}
