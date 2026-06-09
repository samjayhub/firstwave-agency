import type { Platform } from "@/lib/publishers/types";
import type { PostMetrics } from "@/lib/analytics/types";

/** One published item joined to its latest metrics snapshot + plan brief fields. */
export interface PerformanceRecord {
  platform: Platform;
  pillar?: string;
  format?: string;
  idea?: string;
  metrics: PostMetrics;
}

/** Compact, prompt-injectable summary of what performed for a client. */
export interface PerformanceBrief {
  /** Distinct content pillars from the best performers, strongest first. */
  topPillars: string[];
  /** Distinct formats from the best performers, strongest first. */
  topFormats: string[];
  /** The strongest individual posts, for the planner to echo/upgrade. */
  highlights: Array<{ idea: string; platform: Platform; score: number }>;
  /** How many published+measured posts the brief was built from. */
  sampleSize: number;
}

/**
 * Read side of the learning loop: published posts with their latest metrics,
 * tenant-scoped. Implementations: in-memory fake, Prisma.
 */
export interface PerformanceStore {
  recentPerformance(
    agencyId: string,
    clientId: string,
    limit: number,
  ): Promise<PerformanceRecord[]>;
}

/**
 * What the Content Planner depends on to ground a new plan in past results.
 * Implemented by PerformanceService; null when there is nothing measured yet.
 */
export interface PerformanceProvider {
  briefForClient(agencyId: string, clientId: string): Promise<PerformanceBrief | null>;
}
