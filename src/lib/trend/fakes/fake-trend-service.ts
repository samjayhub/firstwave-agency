// Deterministic in-memory test doubles for the Trend Engine.
import type { TrendBrief, TrendFeed, TrendSignal, TrendSource, TrendStore } from "../types";

export class FakeTrendStore implements TrendStore {
  private readonly briefs = new Map<string, TrendBrief>();
  /** Last per-signal list saved, for assertions. */
  readonly saved = new Map<string, TrendSignal[]>();

  private key(agencyId: string, clientId: string): string {
    return `${agencyId}:${clientId}`;
  }

  async save(
    agencyId: string,
    clientId: string,
    signals: TrendSignal[],
    brief: TrendBrief,
  ): Promise<void> {
    const key = this.key(agencyId, clientId);
    this.saved.set(key, signals);
    this.briefs.set(key, brief);
  }

  async getBrief(agencyId: string, clientId: string): Promise<TrendBrief | null> {
    return this.briefs.get(this.key(agencyId, clientId)) ?? null;
  }
}

/** A TrendSource that returns a canned feed keyed by platform. */
export function fakeTrendSource(
  feeds: Record<string, TrendFeed>,
): TrendSource {
  return async ({ platform }) => {
    const feed = feeds[platform];
    if (feed) return feed;
    return { platform, observations: [] };
  };
}
