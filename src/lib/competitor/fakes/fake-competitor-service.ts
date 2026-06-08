// Deterministic in-memory test doubles for the Competitor Engine.
import type {
  CompetitorBrief,
  CompetitorChannel,
  CompetitorMetrics,
  CompetitorSource,
  CompetitorStore,
} from "../types";

export class FakeCompetitorStore implements CompetitorStore {
  private readonly briefs = new Map<string, CompetitorBrief>();
  /** Last per-competitor metrics saved, for assertions. */
  readonly saved = new Map<string, CompetitorMetrics[]>();

  private key(agencyId: string, clientId: string): string {
    return `${agencyId}:${clientId}`;
  }

  async save(
    agencyId: string,
    clientId: string,
    metrics: CompetitorMetrics[],
    brief: CompetitorBrief,
  ): Promise<void> {
    const key = this.key(agencyId, clientId);
    this.saved.set(key, metrics);
    this.briefs.set(key, brief);
  }

  async getBrief(agencyId: string, clientId: string): Promise<CompetitorBrief | null> {
    return this.briefs.get(this.key(agencyId, clientId)) ?? null;
  }
}

/** A CompetitorSource that returns canned channels keyed by URL. */
export function fakeCompetitorSource(
  channels: Record<string, CompetitorChannel>,
): CompetitorSource {
  return async ({ url, platform }) => {
    const channel = channels[url];
    if (channel) return channel;
    return { handle: url, url, platform, posts: [] };
  };
}
