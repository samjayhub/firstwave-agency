// Brand Intelligence service — orchestrates the in-house extraction pipeline:
// crawl → palette/fonts/logo (pure) → LLM voice (audited) → persist BrandProfile.
// All external pieces are injected (crawler, llm, audit sink, stores) so the
// orchestration is testable without a browser, network, or DB.
import type { TenantContext } from "@/lib/db/tenancy";
import type { AiAuditSink } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { ValidationError } from "@/lib/errors/app-error";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { paletteFromCss } from "./colors";
import { fontsFromCss } from "./fonts";
import { pickLogo } from "./logo";
import { analyzeVoice } from "./voice";
import type { BrandCrawler } from "./crawler";
import type { BrandProfileData, ExtractInput } from "./types";

export * from "./types";

/** Persistence for the one-per-client brand profile. */
export interface BrandProfileStore {
  upsert(clientId: string, data: BrandProfileData): Promise<void>;
  findByClient(clientId: string): Promise<BrandProfileData | null>;
}

export interface BrandIntelligenceDeps {
  crawler: BrandCrawler;
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  clients: ClientRepository;
  profiles: BrandProfileStore;
}

export class BrandIntelligenceService {
  constructor(private readonly deps: BrandIntelligenceDeps) {}

  /** Extract and persist the brand profile for a client the caller owns. */
  async extract(ctx: TenantContext, input: ExtractInput): Promise<BrandProfileData> {
    // Ownership: throws NotFound if the client is not in the caller's agency.
    await this.deps.clients.get(ctx, input.clientId);

    if (!/^https?:\/\//i.test(input.websiteUrl)) {
      throw new ValidationError("websiteUrl must be an absolute http(s) URL");
    }

    const page = await this.deps.crawler.crawl(input.websiteUrl);

    const palette = paletteFromCss(page.css);
    const fonts = fontsFromCss(page.css);
    const logoUrl = pickLogo(page.images);

    const voice = await analyzeVoice(
      { llm: this.deps.llm, sink: this.deps.sink, model: this.deps.model },
      { agencyId: ctx.agencyId, clientId: input.clientId },
      page.text,
    );

    const data: BrandProfileData = { palette, fonts, voice, ...(logoUrl ? { logoUrl } : {}) };
    await this.deps.profiles.upsert(input.clientId, data);
    return data;
  }

  /** Read a stored brand profile for a client the caller owns. */
  async get(ctx: TenantContext, clientId: string): Promise<BrandProfileData | null> {
    await this.deps.clients.get(ctx, clientId);
    return this.deps.profiles.findByClient(clientId);
  }
}
