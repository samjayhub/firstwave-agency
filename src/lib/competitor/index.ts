// Competitor Intelligence (replaces Apify). YouTube Data API (free) + own
// scrapers → rank by engagement/cadence/format → LLM "reverse-engineer +
// upgrade" brief. MVP: YouTube + manual competitor URLs (scraping deferred).
// See docs/02 §3 (module 3) and docs/06 §3. Phase 0: stub.

export interface ReverseEngineerInput {
  clientId: string;
  niche: string;
  competitorUrls?: string[]; // manual in MVP
}

export async function buildUpgradeBrief(
  _input: ReverseEngineerInput,
): Promise<unknown> {
  // TODO(phase-2): discover via YouTube Data API + scrapers, extract patterns.
  throw new Error("not implemented");
}
