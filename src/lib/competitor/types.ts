import type { Platform } from "@/lib/publishers/types";

/** A single post/video observation pulled from a competitor source. */
export interface CompetitorPost {
  title: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string; // ISO-8601
  durationSec: number;
}

/** Raw data for one competitor channel, returned by a CompetitorSource. */
export interface CompetitorChannel {
  handle: string;
  url: string;
  platform: Platform;
  posts: CompetitorPost[];
}

/**
 * Deterministic, non-AI metrics computed per competitor.
 * AUDIT-EXEMPT: pure arithmetic over fetched stats, no model call.
 */
export interface CompetitorMetrics {
  handle: string;
  url: string;
  platform: Platform;
  sampleSize: number;
  avgViews: number;
  /** Mean (likes + comments) / views across sampled posts, 0–1. */
  engagementRate: number;
  /** Posting cadence inferred from the sampled posts' date span. */
  postsPerWeek: number;
  /** Content formats present, most frequent first (e.g. ["short","long"]). */
  topFormats: string[];
}

/**
 * Reverse-engineered + upgrade brief synthesised by Claude across competitors.
 * The deterministic `competitors` block grounds the LLM-derived fields.
 */
export interface CompetitorBrief {
  niche: string;
  competitors: CompetitorMetrics[]; // ranked by engagementRate, desc
  hooks: string[]; // recurring hook patterns worth adopting
  formats: string[]; // winning content formats
  rhythm: string; // posting-cadence insight
  recommendations: string[]; // reverse-engineer + upgrade actions
  capturedAt: string; // ISO-8601
}

/**
 * Persistence for a competitor sweep: the aggregate brief plus per-competitor
 * insight rows, tenant-scoped. Implementations: in-memory fake, Prisma.
 */
export interface CompetitorStore {
  save(
    agencyId: string,
    clientId: string,
    metrics: CompetitorMetrics[],
    brief: CompetitorBrief,
  ): Promise<void>;
  getBrief(agencyId: string, clientId: string): Promise<CompetitorBrief | null>;
}

/**
 * Injectable competitor data source (YouTube Data API in production, fake in
 * tests). Given a manual channel URL, returns recent posts with stats.
 */
export type CompetitorSource = (input: {
  url: string;
  platform: Platform;
}) => Promise<CompetitorChannel>;
