import type { Platform } from "@/lib/publishers/types";

/** A raw trending-topic observation pulled from a TrendSource. */
export interface TrendObservation {
  topic: string;
  /** Search/interest volume proxy (>= 0). Scale is source-relative. */
  volume: number;
  /** Recent growth ratio, e.g. 0.4 = +40% week-over-week. May be negative. */
  growth: number;
  /** Optional reference URLs/ids backing the signal. */
  sampleRefs?: string[];
}

/** Raw trend data for one platform, returned by a TrendSource. */
export interface TrendFeed {
  platform: Platform;
  observations: TrendObservation[];
}

/**
 * Deterministic, ranked trend signal.
 * AUDIT-EXEMPT: pure arithmetic over fetched volume/growth — no model call.
 */
export interface TrendSignal {
  topic: string;
  platform: Platform;
  volume: number;
  growth: number;
  /** Composite 0–100 momentum score (volume × growth blend); higher = hotter. */
  score: number;
  sampleRefs: string[];
}

/**
 * Timely-angle brief synthesised by Claude across ranked trend signals.
 * The deterministic `trends` block grounds the LLM-derived fields.
 */
export interface TrendBrief {
  niche: string;
  platform: Platform;
  trends: TrendSignal[]; // ranked by score, desc
  angles: string[]; // timely content angles to ride the trends
  formats: string[]; // formats suited to the trending topics
  recommendations: string[]; // concrete "act now" actions
  capturedAt: string; // ISO-8601
}

/**
 * Persistence for a trend sweep: the aggregate brief plus per-signal Trend rows,
 * tenant-scoped. Implementations: in-memory fake, Prisma.
 */
export interface TrendStore {
  save(
    agencyId: string,
    clientId: string,
    signals: TrendSignal[],
    brief: TrendBrief,
  ): Promise<void>;
  getBrief(agencyId: string, clientId: string): Promise<TrendBrief | null>;
}

/**
 * Injectable trend data source (Google Trends daily RSS in production, fake in
 * tests). Given a niche + seed keywords on a platform, returns trending topics
 * with volume/growth signals.
 */
export type TrendSource = (input: {
  niche: string;
  platform: Platform;
  keywords: string[];
}) => Promise<TrendFeed>;
