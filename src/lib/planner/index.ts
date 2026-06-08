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

export interface ContentPlanStore {
  createPlanWithItems(
    clientId: string,
    startDate: Date,
    items: NewPlanItem[],
  ): Promise<ContentPlanResult>;
  latestForClient(
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

/** Validate + normalize the model's plan against the requested window/platforms. */
export function parsePlan(
  raw: string,
  days: number,
  platforms: Platform[],
): PlanItemBrief[] {
  const allowed = new Set<string>(platforms);
  const items: PlanItemBrief[] = [];
  for (const entry of extractJsonArray(raw)) {
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

function systemPrompt(days: number, platforms: Platform[]): string {
  return [
    `You are a social media strategist creating a ${days}-day content plan.`,
    `Plan only for these platforms: ${platforms.join(", ")}.`,
    "Ground every idea in the brand voice provided by the user.",
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

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: input.clientId,
      action: "content_plan",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: `${days}-day plan for ${safePlatforms.join(", ")}`,
    };

    const briefs = await withAudit(this.deps.sink, meta, async () => {
      const raw = await this.deps.llm.complete(
        [{ role: "user", content: `Brand voice:\n${JSON.stringify(profile.voice)}` }],
        { system: systemPrompt(days, safePlatforms), maxTokens: 4096 },
      );
      const parsed = parsePlan(raw, days, safePlatforms);
      return { result: parsed, outputSummary: `${parsed.length} plan items` };
    });

    const startDate = input.startDate ?? this.clock();
    const items: NewPlanItem[] = briefs.map((brief) => ({
      scheduledAt: addDays(startDate, brief.day - 1),
      copy: { platform: brief.platform, brief },
    }));

    return this.deps.plans.createPlanWithItems(input.clientId, startDate, items);
  }

  async latest(ctx: TenantContext, clientId: string) {
    await this.deps.clients.get(ctx, clientId);
    return this.deps.plans.latestForClient(clientId);
  }
}
