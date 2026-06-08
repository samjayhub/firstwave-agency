// Copy Engine — writes platform-specific caption/hook/hashtags/description for a
// planned ContentItem, grounded in the client's brand voice. Audited.
import { z } from "zod";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "@/lib/llm/json";
import { ExternalServiceError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { BrandProfileStore } from "@/lib/brand-intel";
import type { Platform } from "@/lib/publishers/types";
import type { GeneratedCopy, PlanItemBrief, StoredCopy } from "@/lib/content/types";

export interface ContentItemRecord {
  id: string;
  clientId: string;
  copy: unknown; // raw StoredCopy JSON
}

export interface ContentItemStore {
  /** Tenant-scoped read: resolves the item only if it belongs to the agency. */
  findForAgency(agencyId: string, itemId: string): Promise<ContentItemRecord | null>;
  /** Tenant-scoped write of the copy JSON; returns false if nothing matched. */
  updateCopy(agencyId: string, itemId: string, copy: StoredCopy): Promise<boolean>;
}

export interface CopyEngineDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
  items: ContentItemStore;
  brandProfiles: BrandProfileStore;
}

const StoredCopySchema = z.object({
  platform: z.string(),
  brief: z.object({
    day: z.number(),
    platform: z.string(),
    pillar: z.string(),
    format: z.string(),
    idea: z.string(),
  }),
});

const GeneratedCopySchema = z.object({
  caption: z.string().min(1),
  hook: z.string().min(1),
  hashtags: z.array(z.string()),
  description: z.string(),
});

export function parseGeneratedCopy(raw: string): GeneratedCopy {
  const parsed = GeneratedCopySchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    throw new ExternalServiceError("Copy generation output failed validation");
  }
  return parsed.data;
}

function systemPrompt(platform: Platform): string {
  return [
    `You are a copywriter writing a ${platform} post in the brand's voice.`,
    "Use the provided brand voice and the content brief.",
    "Respond with ONLY a JSON object, no prose, no code fences:",
    '{"caption":"...","hook":"...","hashtags":["..."],"description":"..."}',
    "- caption: the post body. hook: a scroll-stopping first line.",
    "- hashtags: 3-8 relevant tags (no leading #). description: a longer-form variant.",
  ].join("\n");
}

export class CopyEngineService {
  constructor(private readonly deps: CopyEngineDeps) {}

  async write(ctx: TenantContext, itemId: string): Promise<GeneratedCopy> {
    const item = await this.deps.items.findForAgency(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");

    const stored = StoredCopySchema.safeParse(item.copy);
    if (!stored.success) {
      throw new ValidationError("Content item has no plan brief to write copy from");
    }
    const brief = stored.data.brief as PlanItemBrief;
    const platform = brief.platform;

    const profile = await this.deps.brandProfiles.findByClient(item.clientId);
    const voice = profile?.voice ?? null;

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: item.clientId,
      action: "copy_generation",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: `copy for item ${itemId} on ${platform}`,
    };

    const generated = await withAudit(this.deps.sink, meta, async () => {
      const raw = await this.deps.llm.complete(
        [
          {
            role: "user",
            content: `Brand voice:\n${JSON.stringify(voice)}\n\nBrief:\n${JSON.stringify(brief)}`,
          },
        ],
        { system: systemPrompt(platform), maxTokens: 1024 },
      );
      const copy = parseGeneratedCopy(raw);
      return { result: copy, outputSummary: copy.caption.slice(0, 60) };
    });

    const next: StoredCopy = { platform, brief, generated };
    const updated = await this.deps.items.updateCopy(ctx.agencyId, itemId, next);
    if (!updated) throw new NotFoundError("Content item not found");
    return generated;
  }
}
