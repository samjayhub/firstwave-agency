// Media library (P4-10): browse, reuse, version, and lifecycle generated Assets
// across a client. The library spans a client's whole asset history (not one
// item), so a past asset can be found and re-attached to a new item without
// regenerating it.
//
// AUDIT-EXEMPT: rule-based asset bookkeeping (no LLM/generation here — reuse
// deliberately skips the generative path).

/** An asset as the library presents it (the creative AssetRecord + lifecycle). */
export interface MediaAsset {
  id: string;
  contentItemId: string | null;
  kind: string;
  url: string;
  source: string;
  contentHash: string | null;
  groupId: string | null;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface MediaFilter {
  kind?: string;
  source?: string;
  /** Include soft-archived assets (default: live only). */
  includeArchived?: boolean;
}

/** Fields needed to record a reused asset (a new row over the same stored bytes). */
export interface ReattachInput {
  contentItemId: string;
  kind: string;
  url: string;
  contentHash: string | null;
  groupId: string;
  version: number;
  meta: Record<string, unknown>;
}

/** Statuses whose attached assets are "in use" and protected from retention. */
export const RETAINED_STATUSES = ["approved", "scheduled", "published"];

/**
 * Persistence for the media library, tenant-scoped through the
 * Asset → ContentItem → ContentPlan → Client → Agency chain. Implementations:
 * in-memory fake, Prisma.
 */
export interface MediaStore {
  /** All of a client's assets (newest first), filtered. Agency-scoped. */
  listForClient(agencyId: string, clientId: string, filter: MediaFilter): Promise<MediaAsset[]>;
  /** Load one asset + the client it belongs to; null if not the agency's. */
  getForAgency(
    agencyId: string,
    assetId: string,
  ): Promise<(MediaAsset & { clientId: string }) | null>;
  /** Resolve a content item's client; null if it isn't the agency's. */
  itemClient(agencyId: string, itemId: string): Promise<{ clientId: string } | null>;
  /** Insert a reused asset row over an existing stored object. */
  createReattached(agencyId: string, input: ReattachInput): Promise<MediaAsset>;
  /** Anchor a version group on the original asset (set groupId if still null). */
  anchorGroup(agencyId: string, assetId: string, groupId: string): Promise<void>;
  /** The next version number for a group (max existing + 1, or 1). */
  nextVersion(agencyId: string, groupId: string): Promise<number>;
  /** Every asset in a version group, oldest first. */
  listVersions(agencyId: string, groupId: string): Promise<MediaAsset[]>;
  /** Toggle soft-archive; false if the asset isn't the agency's. */
  setArchived(agencyId: string, assetId: string, archived: boolean): Promise<boolean>;
  /**
   * Soft-archive a client's stale, reusable assets created before `before` that
   * aren't attached to an in-use ({@link RETAINED_STATUSES}) item, stamping
   * `archivedAt = at` (the run time, so the purge stage waits from here). Count returned.
   */
  archiveStale(agencyId: string, clientId: string, before: Date, at: Date): Promise<number>;

  // ── Retention purge (P4-10 follow-up) ─────────────────────────
  /** Assets archived before `before` (the second-stage hard-delete candidates). */
  findPurgeable(
    agencyId: string,
    clientId: string,
    before: Date,
  ): Promise<Array<{ id: string; url: string }>>;
  /** Hard-delete asset rows by id (agency-scoped). Returns the count removed. */
  deleteAssets(agencyId: string, ids: string[]): Promise<number>;
  /** How many surviving rows still reference this URL (blob-GC refcount). */
  countByUrl(agencyId: string, url: string): Promise<number>;
  /** Every (agencyId, clientId) the scheduled sweep should visit. */
  sweepTargets(): Promise<Array<{ agencyId: string; clientId: string }>>;
}
