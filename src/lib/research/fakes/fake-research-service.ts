// Deterministic in-memory ResearchBriefStore for tests.
import type { ResearchBrief, ResearchBriefStore } from "../types";

export class FakeResearchBriefStore implements ResearchBriefStore {
  private readonly briefs = new Map<string, ResearchBrief>();

  private key(agencyId: string, clientId: string): string {
    return `${agencyId}:${clientId}`;
  }

  async saveBrief(agencyId: string, clientId: string, brief: ResearchBrief): Promise<void> {
    this.briefs.set(this.key(agencyId, clientId), brief);
  }

  async getBrief(agencyId: string, clientId: string): Promise<ResearchBrief | null> {
    return this.briefs.get(this.key(agencyId, clientId)) ?? null;
  }
}
