// Trend Engine — Google Trends (public) + TikTok Creative Center scraper +
// YouTube trending. Feeds timely angles to the planner. See docs/02 §3
// (module 4). Phase 0: stub.

export interface TrendQuery {
  clientId: string;
  niche: string;
}

export async function fetchTrends(_q: TrendQuery): Promise<unknown[]> {
  // TODO(phase-2): pull from free trend sources, normalize, score.
  throw new Error("not implemented");
}
