// Media library service (P4-10). Browses a client's whole asset history and —
// the headline — re-attaches a past asset to a new content item without
// regenerating it (a fresh row over the same stored bytes, as the next version
// in the source's group). Also handles soft-archive lifecycle + a retention
// sweep. Everything is tenant-scoped through the injected MediaStore.
//
// AUDIT-EXEMPT: no generative/LLM work — reuse exists precisely to avoid it.
import type { TenantContext } from "@/lib/db/tenancy";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { MediaAsset, MediaFilter, MediaStore } from "./types";

export * from "./types";

export interface MediaLibraryDeps {
  store: MediaStore;
  /** Injected for deterministic retention tests. */
  clock?: () => Date;
}

const MAX_RETENTION_DAYS = 3650;

export class MediaLibraryService {
  private readonly now: () => Date;
  constructor(private readonly deps: MediaLibraryDeps) {
    this.now = deps.clock ?? (() => new Date());
  }

  /** Browse every asset for a client (newest first), optionally filtered. */
  list(ctx: TenantContext, clientId: string, filter: MediaFilter = {}): Promise<MediaAsset[]> {
    return this.deps.store.listForClient(ctx.agencyId, clientId, filter);
  }

  /**
   * Re-attach an existing asset to another content item of the SAME client — no
   * regeneration. The new row points at the same stored object and is the next
   * version in the source's group.
   */
  async reattach(
    ctx: TenantContext,
    assetId: string,
    targetItemId: string,
  ): Promise<MediaAsset> {
    const source = await this.deps.store.getForAgency(ctx.agencyId, assetId);
    if (!source) throw new NotFoundError("Asset not found");

    const target = await this.deps.store.itemClient(ctx.agencyId, targetItemId);
    if (!target) throw new NotFoundError("Content item not found");
    // Brand assets must not leak across clients — reuse stays within a client.
    if (target.clientId !== source.clientId) {
      throw new ValidationError("An asset can only be reused within its own client");
    }

    const groupId = source.groupId ?? source.id;
    if (!source.groupId) await this.deps.store.anchorGroup(ctx.agencyId, source.id, groupId);
    const version = await this.deps.store.nextVersion(ctx.agencyId, groupId);

    return this.deps.store.createReattached(ctx.agencyId, {
      contentItemId: targetItemId,
      kind: source.kind,
      url: source.url,
      contentHash: source.contentHash,
      groupId,
      version,
      meta: { reusedFrom: source.id },
    });
  }

  /** All versions of the asset's group, oldest first (just itself if ungrouped). */
  async versions(ctx: TenantContext, assetId: string): Promise<MediaAsset[]> {
    const asset = await this.deps.store.getForAgency(ctx.agencyId, assetId);
    if (!asset) throw new NotFoundError("Asset not found");
    if (!asset.groupId) {
      const { clientId: _omit, ...rest } = asset;
      return [rest];
    }
    return this.deps.store.listVersions(ctx.agencyId, asset.groupId);
  }

  /** Soft-archive or restore an asset (lifecycle). */
  async setArchived(ctx: TenantContext, assetId: string, archived: boolean): Promise<void> {
    const ok = await this.deps.store.setArchived(ctx.agencyId, assetId, archived);
    if (!ok) throw new NotFoundError("Asset not found");
  }

  /**
   * Retention sweep: archive a client's reusable assets older than
   * `olderThanDays` that aren't attached to an in-use item. Returns the count.
   */
  async runRetention(
    ctx: TenantContext,
    clientId: string,
    olderThanDays: number,
  ): Promise<{ archived: number }> {
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1 || olderThanDays > MAX_RETENTION_DAYS) {
      throw new ValidationError("olderThanDays must be between 1 and 3650");
    }
    const before = new Date(this.now().getTime() - olderThanDays * 24 * 60 * 60 * 1000);
    const archived = await this.deps.store.archiveStale(ctx.agencyId, clientId, before);
    return { archived };
  }
}
