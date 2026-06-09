// Analytics feedback loop — pulls post performance back from each platform's
// official API (via the same Publisher adapter that posted it) and persists an
// AnalyticsSnapshot per refresh, so the next plan can learn from what performed.
//
// AUDIT-EXEMPT: this is a rule-based (non-LLM) action; the AnalyticsSnapshot
// rows ARE its audit trail — nothing is written to ai_audit_log.
import type { TenantContext } from "@/lib/db/tenancy";
import type { Platform, Publisher } from "@/lib/publishers/types";
import { decryptToken } from "@/lib/crypto/tokens";
import { NotFoundError } from "@/lib/errors/app-error";
import type { AnalyticsStore, PostMetrics, StoredSnapshot } from "./types";

export * from "./types";

export interface AnalyticsServiceDeps {
  store: AnalyticsStore;
  resolvePublisher: (platform: Platform) => Publisher;
  decrypt?: (s: string) => string;
  clock?: () => Date;
}

export class AnalyticsService {
  private readonly decrypt: (s: string) => string;
  private readonly clock: () => Date;

  constructor(private readonly deps: AnalyticsServiceDeps) {
    this.decrypt = deps.decrypt ?? decryptToken;
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Fetch fresh metrics for a published post and store a snapshot. */
  async refresh(ctx: TenantContext, publishJobId: string): Promise<StoredSnapshot> {
    const post = await this.deps.store.getPublishedPost(ctx.agencyId, publishJobId);
    if (!post) {
      throw new NotFoundError("No published post found for this job");
    }

    const snapshot = await this.deps.resolvePublisher(post.platform).fetchMetrics({
      accessToken: this.decrypt(post.accessTokenEnc),
      externalId: post.postExternalId,
    });

    const metrics: PostMetrics = {
      ...(snapshot.impressions !== undefined ? { impressions: snapshot.impressions } : {}),
      ...(snapshot.likes !== undefined ? { likes: snapshot.likes } : {}),
      ...(snapshot.comments !== undefined ? { comments: snapshot.comments } : {}),
      ...(snapshot.shares !== undefined ? { shares: snapshot.shares } : {}),
    };
    // Prefer the adapter's captured time; fall back to our clock.
    const capturedAt = snapshot.capturedAt ?? this.clock();

    await this.deps.store.saveSnapshot(publishJobId, metrics, capturedAt);
    return { metrics, capturedAt };
  }

  /** Read the stored snapshots for a publish job, newest first. */
  async list(ctx: TenantContext, publishJobId: string): Promise<StoredSnapshot[]> {
    return this.deps.store.listSnapshots(ctx.agencyId, publishJobId);
  }
}
