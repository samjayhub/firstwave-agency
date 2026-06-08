export interface ResearchBrief {
  niche: string;
  angles: string[];
  painPoints: string[];
  pillars: string[];
  capturedAt: string; // ISO-8601
}

export interface ResearchBriefStore {
  saveBrief(agencyId: string, clientId: string, brief: ResearchBrief): Promise<void>;
  getBrief(agencyId: string, clientId: string): Promise<ResearchBrief | null>;
}

/** Injectable HTTP fetcher — production impl applies assertPublicUrl before calling. */
export type UrlFetcher = (url: string) => Promise<string>;
