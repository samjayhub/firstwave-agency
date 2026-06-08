// Deterministic in-memory test double for the analytics store.
import type {
  AnalyticsStore,
  PostMetrics,
  PublishedPost,
  StoredSnapshot,
} from "../types";

export class FakeAnalyticsStore implements AnalyticsStore {
  /** Seeded published posts keyed by `${agencyId}:${publishJobId}`. */
  readonly posts = new Map<string, PublishedPost>();
  /** Saved snapshots keyed by publishJobId. */
  readonly snapshots = new Map<string, StoredSnapshot[]>();

  seedPost(agencyId: string, post: PublishedPost): void {
    this.posts.set(`${agencyId}:${post.publishJobId}`, post);
  }

  async getPublishedPost(agencyId: string, publishJobId: string): Promise<PublishedPost | null> {
    return this.posts.get(`${agencyId}:${publishJobId}`) ?? null;
  }

  async saveSnapshot(publishJobId: string, metrics: PostMetrics, capturedAt: Date): Promise<void> {
    const list = this.snapshots.get(publishJobId) ?? [];
    list.unshift({ metrics, capturedAt });
    this.snapshots.set(publishJobId, list);
  }

  async listSnapshots(_agencyId: string, publishJobId: string): Promise<StoredSnapshot[]> {
    return this.snapshots.get(publishJobId) ?? [];
  }
}
