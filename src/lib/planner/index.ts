// Content Planner — LLM builds the 30-day calendar grounded in BrandProfile +
// competitor + trend inputs. See docs/02 §3 (module 5). Phase 0: stub.

export interface PlanInput {
  clientId: string;
  days: number; // 30 by default
  // brandProfile, competitorBrief, trends are loaded inside.
}

export async function generateContentPlan(_input: PlanInput): Promise<unknown> {
  // TODO(phase-1): prompt the LLM for a per-platform calendar (pillars, cadence,
  // formats) → persist as ContentPlan + ContentItem[] in draft status.
  throw new Error("not implemented");
}
