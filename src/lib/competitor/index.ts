// Competitor Intelligence — fetches recent posts from competitor channels
// (YouTube Data API + manual URLs), ranks them by deterministic engagement/
// cadence/format metrics, then has Claude reverse-engineer the winning hooks/
// formats/rhythm into an "upgrade" brief that feeds the planner.
// The metric maths is rule-based (AUDIT-EXEMPT, see metrics.ts); the single
// LLM synthesis call is wrapped in withAudit.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "@/lib/llm/json";
import { ExternalServiceError, ValidationError } from "@/lib/errors/app-error";
import { ClientRepository } from "@/lib/repositories/client-repository";
import type { Platform } from "@/lib/publishers/types";
import { computeMetrics, rankByEngagement } from "./metrics";
import type {
  CompetitorBrief,
  CompetitorMetrics,
  CompetitorSource,
  CompetitorStore,
} from "./types";

export * from "./types";
export { computeMetrics, rankByEngagement } from "./metrics";

export interface CompetitorInput {
  clientId: string;
  /** Manual competitor channel URLs. MVP platform: youtube. */
  competitors: Array<{ url: string; platform?: Platform }>;
}

export interface CompetitorServiceDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  store: CompetitorStore;
  clients: ClientRepository;
  source: CompetitorSource;
  clock?: () => Date;
}

const MAX_COMPETITORS = 5;
const SAMPLE_TITLES = 5;

const SynthesisSchema = z.object({
  hooks: z.array(z.string().min(1)).min(1).max(10),
  formats: z.array(z.string().min(1)).min(1).max(8),
  rhythm: z.string().min(1),
  recommendations: z.array(z.string().min(1)).min(1).max(10),
});

const SYSTEM_PROMPT = [
  "You are a competitive content strategist.",
  "Given competitor performance metrics and sample post titles in a niche,",
  "reverse-engineer what is working and propose how to do it better. Identify:",
  "- hooks: 3-7 recurring hook/angle patterns driving engagement",
  "- formats: 2-5 winning content formats (e.g. short tutorial, listicle, react)",
  "- rhythm: one sentence on the posting cadence the client should match or beat",
  "- recommendations: 3-7 concrete 'do this, but better' actions for the client",
  "Respond with ONLY a JSON object, no prose, no code fences:",
  '{"hooks":["..."],"formats":["..."],"rhythm":"...","recommendations":["..."]}',
].join("\n");

function describeCompetitor(m: CompetitorMetrics, sampleTitles: string[]): string {
  return [
    `@${m.handle} (${m.platform})`,
    `engagementRate=${m.engagementRate}, postsPerWeek=${m.postsPerWeek}, avgViews=${m.avgViews}`,
    `formats=${m.topFormats.join("/") || "n/a"}`,
    sampleTitles.length > 0 ? `sample titles: ${sampleTitles.map((t) => `"${t}"`).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export class CompetitorService {
  private readonly clock: () => Date;

  constructor(private readonly deps: CompetitorServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async analyze(ctx: TenantContext, input: CompetitorInput): Promise<CompetitorBrief> {
    const client = await this.deps.clients.get(ctx, input.clientId);
    if (!client.niche) {
      throw new ValidationError("Client has no niche set — update the client record first");
    }
    if (!input.competitors || input.competitors.length === 0) {
      throw new ValidationError("Provide at least one competitor URL");
    }

    // Fetch + reduce each competitor to deterministic metrics (no LLM here).
    const targets = input.competitors.slice(0, MAX_COMPETITORS);
    const titlesByHandle = new Map<string, string[]>();
    const metrics: CompetitorMetrics[] = [];
    for (const target of targets) {
      const channel = await this.deps.source({
        url: target.url,
        platform: target.platform ?? "youtube",
      });
      const m = computeMetrics(channel);
      metrics.push(m);
      titlesByHandle.set(
        m.handle,
        channel.posts.slice(0, SAMPLE_TITLES).map((p) => p.title),
      );
    }
    const ranked = rankByEngagement(metrics);

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: input.clientId,
      action: "competitor_analysis",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: `competitor analysis for "${client.niche}" across ${ranked.length} channels`,
    };

    const brief = await withAudit(this.deps.sink, meta, async () => {
      const userContent = [
        `Niche: ${client.niche}`,
        "",
        "Competitors (ranked by engagement):",
        ...ranked.map(
          (m, i) => `--- #${i + 1} ---\n${describeCompetitor(m, titlesByHandle.get(m.handle) ?? [])}`,
        ),
      ].join("\n");

      const raw = await this.deps.llm.complete(
        [{ role: "user", content: userContent }],
        { system: SYSTEM_PROMPT, maxTokens: 1024 },
      );

      const parsed = SynthesisSchema.safeParse(extractJsonObject(raw));
      if (!parsed.success) {
        throw new ExternalServiceError("Competitor brief response failed schema validation");
      }

      const result: CompetitorBrief = {
        niche: client.niche!,
        competitors: ranked,
        hooks: parsed.data.hooks,
        formats: parsed.data.formats,
        rhythm: parsed.data.rhythm,
        recommendations: parsed.data.recommendations,
        capturedAt: this.clock().toISOString(),
      };
      return {
        result,
        outputSummary: `${result.hooks.length} hooks, ${result.recommendations.length} recommendations`,
      };
    });

    await this.deps.store.save(ctx.agencyId, input.clientId, ranked, brief);
    return brief;
  }

  async getBrief(ctx: TenantContext, clientId: string): Promise<CompetitorBrief | null> {
    await this.deps.clients.get(ctx, clientId);
    return this.deps.store.getBrief(ctx.agencyId, clientId);
  }
}
