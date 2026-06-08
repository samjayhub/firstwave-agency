import type { Platform } from "@/lib/publishers/types";

/** The performance numbers we persist per snapshot (capturedAt is a column). */
export interface PostMetrics {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

/** A published post resolved for a metrics refresh, with the token to read it. */
export interface PublishedPost {
  publishJobId: string;
  platform: Platform;
  /** The platform's id for the live post. */
  postExternalId: string;
  /** Encrypted access token of a connected account on this client + platform. */
  accessTokenEnc: string;
}

export interface StoredSnapshot {
  metrics: PostMetrics;
  capturedAt: Date;
}

/**
 * Persistence for the analytics feedback loop, tenant-scoped. Implementations:
 * in-memory fake, Prisma.
 */
export interface AnalyticsStore {
  /**
   * Resolve a PUBLISHED publish job (scoped to the agency) plus a connected
   * account token for its platform, or null if not found / not published / no
   * account to read it with.
   */
  getPublishedPost(agencyId: string, publishJobId: string): Promise<PublishedPost | null>;
  saveSnapshot(publishJobId: string, metrics: PostMetrics, capturedAt: Date): Promise<void>;
  listSnapshots(agencyId: string, publishJobId: string): Promise<StoredSnapshot[]>;
}
