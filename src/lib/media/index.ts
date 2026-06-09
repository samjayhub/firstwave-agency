// Media library service (P4-10). Browses a client's whole asset history and —
// the headline — re-attaches a past asset to a new content item without
// regenerating it (a fresh row over the same stored bytes, as the next version
// in the source's group). Also handles soft-archive lifecycle + a retention
// sweep. Everything is tenant-scoped through the injected MediaStore.
//
// AUDIT-EXEMPT: no generative/LLM work — reuse exists precisely to avoid it.
import type { TenantContext } from "@/lib/db/tenancy";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import type { AssetStorage } from "@/lib/creative/types";
import type { MediaAsset, MediaFilter, MediaStore } from "./types";

export * from "./types";

export interface MediaLibraryDeps {
  store: MediaStore;
  /** Object storage — required for blob purge; browse/reuse work without it. */
  storage?: AssetStorage;
  /** Injected for deterministic retention tests. */
  clock?: () => Date;
}

const MAX_RETENTION_DAYS = 3650;

export interface PurgeResult {
  /** Asset rows hard-deleted. */
  purged: number;
  /** Backing storage objects deleted (≤ purged — dedupe lets rows share a blob). */
  blobsDeleted: number;
}

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
    const now = this.now();
    const before = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
    const archived = await this.deps.store.archiveStale(ctx.agencyId, clientId, before, now);
    return { archived };
  }

  /**
   * Stage two of retention: hard-delete a client's assets that have been archived
   * for at least `archivedForDays`, and GC each backing blob once no surviving row
   * references it (dedupe + reuse let rows share a stored object). Best-effort on
   * the storage side — a delete failure is logged, not fatal.
   */
  async purgeArchived(
    ctx: TenantContext,
    clientId: string,
    archivedForDays: number,
  ): Promise<PurgeResult> {
    if (!Number.isFinite(archivedForDays) || archivedForDays < 0 || archivedForDays > MAX_RETENTION_DAYS) {
      throw new ValidationError("archivedForDays must be between 0 and 3650");
    }
    const before = new Date(this.now().getTime() - archivedForDays * 24 * 60 * 60 * 1000);
    const purgeable = await this.deps.store.findPurgeable(ctx.agencyId, clientId, before);
    if (purgeable.length === 0) return { purged: 0, blobsDeleted: 0 };

    const urls = [...new Set(purgeable.map((p) => p.url))];
    const purged = await this.deps.store.deleteAssets(
      ctx.agencyId,
      purgeable.map((p) => p.id),
    );

    let blobsDeleted = 0;
    if (this.deps.storage) {
      for (const url of urls) {
        // GC the blob only once nothing references it anymore (rows deleted above).
        if ((await this.deps.store.countByUrl(ctx.agencyId, url)) > 0) continue;
        try {
          await this.deps.storage.deleteByUrl(url);
          blobsDeleted++;
        } catch (err) {
          logger.warn("media blob delete failed", {
            url,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return { purged, blobsDeleted };
  }

  /**
   * The scheduled sweep (worker heartbeat): across every client, soft-archive
   * stale assets and — when `purgeDays` is set — purge ones archived long enough.
   * No TenantContext: it runs system-wide off the cron.
   */
  async runRetentionSweep(
    retentionDays: number,
    purgeDays: number | null,
  ): Promise<{ clients: number; archived: number; purged: number; blobsDeleted: number }> {
    const targets = await this.deps.store.sweepTargets();
    let archived = 0;
    let purged = 0;
    let blobsDeleted = 0;
    for (const { agencyId, clientId } of targets) {
      const ctx: TenantContext = { agencyId };
      archived += (await this.runRetention(ctx, clientId, retentionDays)).archived;
      if (purgeDays !== null) {
        const r = await this.purgeArchived(ctx, clientId, purgeDays);
        purged += r.purged;
        blobsDeleted += r.blobsDeleted;
      }
    }
    return { clients: targets.length, archived, purged, blobsDeleted };
  }
}
