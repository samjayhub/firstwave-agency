// Design Director — the specialist-agents design path (P3-08, Lovart pattern).
// The director agent sets the creative direction, then three specialist agents
// (copy, colour, imagery) work IN PARALLEL within that direction, and the director
// composes their parts into one DesignSpec persisted on the content item. Each
// agent is a separate LLM call, so each is independently AUDITED (one audit row
// per specialist) — the design's full provenance is the four rows it writes.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAction, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider, LlmCompleteOptions } from "@/lib/llm";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { BrandProfileStore } from "@/lib/brand-intel";
import type { PlanItemBrief } from "@/lib/content/types";
import type {
  ArtDirection,
  DesignBrandContext,
  DesignColors,
  DesignCopy,
  DesignItemStore,
  DesignSpec,
} from "./types";
import {
  ART_DIRECTOR_SYSTEM,
  COLOR_SPECIALIST_SYSTEM,
  COPY_SPECIALIST_SYSTEM,
  IMAGERY_SPECIALIST_SYSTEM,
  parseArtDirection,
  parseDesignColors,
  parseDesignCopy,
  parseDesignImagery,
} from "./specialists";

export * from "./types";

export interface DesignDirectorDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  items: DesignItemStore;
  brandProfiles: BrandProfileStore;
}

const BriefSchema = z.object({
  brief: z.object({
    idea: z.string(),
    format: z.string(),
    pillar: z.string(),
    platform: z.string(),
    day: z.number(),
  }),
});

export class DesignDirectorService {
  constructor(private readonly deps: DesignDirectorDeps) {}

  async design(ctx: TenantContext, itemId: string): Promise<DesignSpec> {
    const item = await this.deps.items.findForAgency(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");

    const parsed = BriefSchema.safeParse(item.copy);
    if (!parsed.success) {
      throw new ValidationError("Content item has no plan brief to design from");
    }
    const brief = parsed.data.brief as PlanItemBrief;

    const profile = await this.deps.brandProfiles.findByClient(item.clientId);
    const brand: DesignBrandContext = {
      palette: (profile?.palette ?? []).map((p) => p.hex),
      fonts: (profile?.fonts ?? []).map((f) => f.family),
      voice: profile?.voice ?? null,
    };

    // 1) The art director sets the direction the specialists work within.
    const direction = await this.runAgent(
      ctx,
      item.clientId,
      "design_direction",
      ART_DIRECTOR_SYSTEM,
      { brand, brief },
      parseArtDirection,
      (d) => d.concept.slice(0, 60),
    );

    // 2) The three specialists work in parallel within that direction.
    const [copy, colors, imagePrompt] = await Promise.all([
      this.runAgent<DesignCopy>(
        ctx,
        item.clientId,
        "design_copy",
        COPY_SPECIALIST_SYSTEM,
        { brand, brief, direction },
        parseDesignCopy,
        (c) => c.headline.slice(0, 60),
      ),
      this.runAgent<DesignColors>(
        ctx,
        item.clientId,
        "design_color",
        COLOR_SPECIALIST_SYSTEM,
        { brand, brief, direction },
        parseDesignColors,
        (c) => `${c.background}/${c.foreground}/${c.accent}`,
      ),
      this.runAgent<string>(
        ctx,
        item.clientId,
        "design_imagery",
        IMAGERY_SPECIALIST_SYSTEM,
        { brand, brief, direction },
        parseDesignImagery,
        (p) => p.slice(0, 60),
      ),
    ]);

    // 3) The director composes the parts into one spec.
    const spec: DesignSpec = {
      concept: direction.concept,
      mood: direction.mood,
      composition: direction.composition,
      copy,
      colors,
      imagePrompt,
      model: this.deps.model,
    };

    const saved = await this.deps.items.saveSpec(ctx.agencyId, itemId, spec);
    if (!saved) throw new NotFoundError("Content item not found");
    return spec;
  }

  /** Run one specialist agent: an audited LLM call with a parsed JSON result. */
  private async runAgent<T>(
    ctx: TenantContext,
    clientId: string,
    action: AiAction,
    system: string,
    context: unknown,
    parseFn: (raw: string) => T,
    summarize: (result: T) => string,
    opts: LlmCompleteOptions = { maxTokens: 700 },
  ): Promise<T> {
    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId,
      action,
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: action,
    };
    return withAudit(this.deps.sink, meta, async () => {
      const raw = await this.deps.llm.complete(
        [{ role: "user", content: JSON.stringify(context) }],
        { system, ...opts },
      );
      const result = parseFn(raw);
      return { result, outputSummary: summarize(result) };
    });
  }
}
