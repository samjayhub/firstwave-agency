// Trend Engine — pulls trending topics for a client's niche from a TrendSource
// (Google Trends in production, manual seed keywords feeding it), ranks them by
// deterministic volume/momentum scoring, then has Claude turn the winning trends
// into timely content angles/formats/recommendations that feed the planner.
// The ranking maths is rule-based (AUDIT-EXEMPT, see metrics.ts); the single LLM
// synthesis call is wrapped in withAudit.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "@/lib/llm/json";
import { ExternalServiceError, ValidationError } from "@/lib/errors/app-error";
import { ClientRepository } from "@/lib/repositories/client-repository";
import type { Platform } from "@/lib/publishers/types";
import { rankTrends } from "./metrics";
import type { TrendBrief, TrendSignal, TrendSource, TrendStore } from "./types";

export * from "./types";
export { rankTrends } from "./metrics";

export interface TrendInput {
  clientId: string;
  /** Platform to source trends for. Defaults to youtube (MVP). */
  platform?: Platform;
  /** Optional seed keywords to focus the source beyond the client's niche. */
  keywords?: string[];
}

export interface TrendServiceDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  store: TrendStore;
  clients: ClientRepository;
  source: TrendSource;
  clock?: () => Date;
}

const MAX_KEYWORDS = 8;
const MAX_SIGNALS = 12;
const TOP_SIGNALS_PROMPTED = 8;

const SynthesisSchema = z.object({
  angles: z.array(z.string().min(1)).min(1).max(10),
  formats: z.array(z.string().min(1)).min(1).max(8),
  recommendations: z.array(z.string().min(1)).min(1).max(10),
});

const SYSTEM_PROMPT = [
  "You are a social-media trend strategist.",
  "Given a niche and a ranked list of currently-trending topics (with momentum",
  "scores), turn the timely opportunities into a content plan. Identify:",
  "- angles: 3-7 specific, timely content angles that ride these trends",
  "- formats: 2-5 content formats best suited to the trending topics",
  "- recommendations: 3-7 concrete 'post this now' actions, ordered by urgency",
  "Favour trends with both high volume and high growth. Respond with ONLY a JSON",
  "object, no prose, no code fences:",
  '{"angles":["..."],"formats":["..."],"recommendations":["..."]}',
].join("\n");

function describeSignal(s: TrendSignal): string {
  return `"${s.topic}" — score=${s.score}, volume=${s.volume}, growth=${s.growth}`;
}

export class TrendService {
  private readonly clock: () => Date;

  constructor(private readonly deps: TrendServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async analyze(ctx: TenantContext, input: TrendInput): Promise<TrendBrief> {
    const client = await this.deps.clients.get(ctx, input.clientId);
    if (!client.niche) {
      throw new ValidationError("Client has no niche set — update the client record first");
    }

    const platform: Platform = input.platform ?? "youtube";
    const keywords = (input.keywords ?? []).slice(0, MAX_KEYWORDS);

    // Fetch + reduce to deterministic ranked signals (no LLM here).
    const feed = await this.deps.source({ niche: client.niche, platform, keywords });
    const ranked = rankTrends(feed).slice(0, MAX_SIGNALS);
    if (ranked.length === 0) {
      throw new ExternalServiceError("Trend source returned no observations");
    }

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: input.clientId,
      action: "trend_analysis",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: `trend analysis for "${client.niche}" on ${platform} across ${ranked.length} topics`,
    };

    const brief = await withAudit(this.deps.sink, meta, async () => {
      const userContent = [
        `Niche: ${client.niche}`,
        `Platform: ${platform}`,
        "",
        "Trending topics (ranked by momentum):",
        ...ranked.slice(0, TOP_SIGNALS_PROMPTED).map((s, i) => `#${i + 1} ${describeSignal(s)}`),
      ].join("\n");

      const raw = await this.deps.llm.complete(
        [{ role: "user", content: userContent }],
        { system: SYSTEM_PROMPT, maxTokens: 1024 },
      );

      const parsed = SynthesisSchema.safeParse(extractJsonObject(raw));
      if (!parsed.success) {
        throw new ExternalServiceError("Trend brief response failed schema validation");
      }

      const result: TrendBrief = {
        niche: client.niche!,
        platform,
        trends: ranked,
        angles: parsed.data.angles,
        formats: parsed.data.formats,
        recommendations: parsed.data.recommendations,
        capturedAt: this.clock().toISOString(),
      };
      return {
        result,
        outputSummary: `${result.angles.length} angles, ${result.recommendations.length} recommendations`,
      };
    });

    await this.deps.store.save(ctx.agencyId, input.clientId, ranked, brief);
    return brief;
  }

  async getBrief(ctx: TenantContext, clientId: string): Promise<TrendBrief | null> {
    await this.deps.clients.get(ctx, clientId);
    return this.deps.store.getBrief(ctx.agencyId, clientId);
  }
}
