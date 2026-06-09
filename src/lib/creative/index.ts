// Creative Studio service — generates a brand-styled image for a content item,
// stores the bytes, and records an Asset row. The generation call is audited.
// Everything external (provider, storage, repos) is injected for testability.
import { randomUUID } from "node:crypto";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import { getEnv } from "@/lib/config/env";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { BrandProfileStore } from "@/lib/brand-intel";
import type { ContentItemStore } from "@/lib/copy";
import type { StoredCopy } from "@/lib/content/types";
import type { AssetStorage, CreativeProvider, ImageRequest } from "./types";
import { FakeCreativeProvider } from "./fake";
import { HostedImageProvider } from "./hosted";
import { LocalAssetStorage } from "./asset-storage";

export * from "./types";

export interface AssetRecord {
  id: string;
  contentItemId: string | null;
  kind: string;
  url: string;
  source: string;
  createdAt: Date;
}

export interface NewAsset {
  contentItemId: string;
  kind: "image" | "video";
  url: string;
  source: "generated";
  meta?: Record<string, unknown>;
}

export interface AssetRepository {
  /** Scoped create — verifies the content item belongs to the agency. */
  create(agencyId: string, input: NewAsset): Promise<AssetRecord>;
  listForItem(agencyId: string, itemId: string): Promise<AssetRecord[]>;
}

// Formats that typically carry in-image text → route to a text-strong model.
const LEGIBLE_TEXT_FORMATS = new Set(["flyer", "carousel", "image", "quote", "poster"]);

export interface CreativeStudioDeps {
  provider: CreativeProvider;
  storage: AssetStorage;
  assets: AssetRepository;
  items: ContentItemStore;
  brandProfiles: BrandProfileStore;
  sink: AiAuditSink;
  idGen?: () => string;
}

export class CreativeStudioService {
  private readonly idGen: () => string;
  constructor(private readonly deps: CreativeStudioDeps) {
    this.idGen = deps.idGen ?? (() => randomUUID());
  }

  async generateImage(
    ctx: TenantContext,
    itemId: string,
    promptOverride?: string,
  ): Promise<AssetRecord> {
    const item = await this.deps.items.findForAgency(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");

    const copy = item.copy as StoredCopy | null;
    const brief = copy?.brief;
    const prompt = promptOverride?.trim() || brief?.idea;
    if (!prompt) {
      throw new ValidationError("No prompt available; provide one or plan the item first");
    }

    const profile = await this.deps.brandProfiles.findByClient(item.clientId);
    const style = {
      palette: (profile?.palette ?? []).map((p) => p.hex),
      fonts: (profile?.fonts ?? []).map((f) => f.family),
    };
    const needsLegibleText = brief ? LEGIBLE_TEXT_FORMATS.has(brief.format) : false;
    const req: ImageRequest = { prompt, style, needsLegibleText };

    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId: item.clientId,
      action: "image_generation",
      provider: "image-gen",
      model: "image-gen",
      inputSummary: `image for item ${itemId}${needsLegibleText ? " (legible-text)" : ""}`,
    };

    const result = await withAudit(this.deps.sink, meta, async () => {
      const r = await this.deps.provider.generateImage(req);
      return { result: r, outputSummary: r.model, model: r.model };
    });

    const key = `${item.clientId}/${itemId}/${this.idGen()}.png`;
    const stored = await this.deps.storage.put(key, result.bytes, result.contentType);

    return this.deps.assets.create(ctx.agencyId, {
      contentItemId: itemId,
      kind: "image",
      url: stored.url,
      source: "generated",
      meta: { model: result.model, prompt },
    });
  }

  async listForItem(ctx: TenantContext, itemId: string): Promise<AssetRecord[]> {
    const item = await this.deps.items.findForAgency(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");
    return this.deps.assets.listForItem(ctx.agencyId, itemId);
  }
}

/** Production image provider — fake until a key/provider is configured. */
export function getCreativeProvider(): CreativeProvider {
  const env = getEnv();
  if (env.IMAGE_GEN_PROVIDER === "fake" || !env.IMAGE_GEN_API_KEY) {
    return new FakeCreativeProvider();
  }
  return new HostedImageProvider(env.IMAGE_GEN_API_KEY, env.IMAGE_GEN_PROVIDER, {});
}

export function getAssetStorage(): AssetStorage {
  return new LocalAssetStorage(getEnv().ASSET_STORAGE_DIR);
}
