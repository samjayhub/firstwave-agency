// Research Engine — synthesises a niche brief (angles, pain points, content pillars)
// via optional seed-URL context + Claude. Every LLM call is audited.
// Seed URLs are SSRF-guarded before fetch; the production UrlFetcher enforces this.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "@/lib/llm/json";
import { ExternalServiceError, ValidationError } from "@/lib/errors/app-error";
import { ClientRepository } from "@/lib/repositories/client-repository";
import type { ResearchBrief, ResearchBriefStore, UrlFetcher } from "./types";

export * from "./types";

export interface ResearchInput {
  clientId: string;
  /** Optional reference URLs, SSRF-guarded by the production UrlFetcher. */
  seedUrls?: string[];
}

export interface ResearchServiceDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  store: ResearchBriefStore;
  clients: ClientRepository;
  fetchUrl: UrlFetcher;
  clock?: () => Date;
}

const MAX_SEED_URLS = 3;
const MAX_URL_CHARS = 2000;

const BriefSchema = z.object({
  angles: z.array(z.string().min(1)).min(1).max(10),
  painPoints: z.array(z.string().min(1)).min(1).max(10),
  pillars: z.array(z.string().min(1)).min(1).max(8),
});

const SYSTEM_PROMPT = [
  "You are a content strategist conducting niche research.",
  "Given a niche and optional reference content, identify:",
  "- angles: 3-7 unique hooks that attract the target audience",
  "- painPoints: 3-7 specific frustrations the audience experiences",
  "- pillars: 3-5 evergreen content themes to build authority",
  "Respond with ONLY a JSON object, no prose, no code fences:",
  '{"angles":["..."],"painPoints":["..."],"pillars":["..."]}',
].join("\n");

export class ResearchService {
  private readonly clock: () => Date;

  constructor(private readonly deps: ResearchServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async synthesize(ctx: TenantContext, input: ResearchInput): Promise<ResearchBrief> {
    const client = await this.deps.clients.get(ctx, input.clientId);
    if (!client.niche) {
      throw new ValidationError("Client has no niche set — update the client record first");
    }

    const urlContents: string[] = [];
    if (input.seedUrls && input.seedUrls.length > 0) {
      for (const url of input.seedUrls.slice(0, MAX_SEED_URLS)) {
        const text = await this.deps.fetchUrl(url);
        urlContents.push(text.slice(0, MAX_URL_CHARS));
      }
    }

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: input.clientId,
      action: "research_brief",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: `niche research for "${client.niche}"${urlContents.length > 0 ? ` + ${urlContents.length} ref URLs` : ""}`,
    };

    const brief = await withAudit(this.deps.sink, meta, async () => {
      const userContent = [
        `Niche: ${client.niche}`,
        ...(urlContents.length > 0
          ? urlContents.map((c, i) => `--- Reference ${i + 1} ---\n${c}`)
          : []),
      ].join("\n\n");

      const raw = await this.deps.llm.complete(
        [{ role: "user", content: userContent }],
        { system: SYSTEM_PROMPT, maxTokens: 1024 },
      );

      const parsed = BriefSchema.safeParse(extractJsonObject(raw));
      if (!parsed.success) {
        throw new ExternalServiceError("Research brief response failed schema validation");
      }

      const result: ResearchBrief = {
        niche: client.niche!,
        angles: parsed.data.angles,
        painPoints: parsed.data.painPoints,
        pillars: parsed.data.pillars,
        capturedAt: this.clock().toISOString(),
      };
      return {
        result,
        outputSummary: `${result.pillars.length} pillars, ${result.angles.length} angles`,
      };
    });

    await this.deps.store.saveBrief(ctx.agencyId, input.clientId, brief);
    return brief;
  }

  async getBrief(ctx: TenantContext, clientId: string): Promise<ResearchBrief | null> {
    await this.deps.clients.get(ctx, clientId);
    return this.deps.store.getBrief(ctx.agencyId, clientId);
  }
}
