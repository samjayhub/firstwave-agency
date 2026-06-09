import type { Platform } from "@/lib/publishers/types";
import type { PostMetrics } from "@/lib/analytics/types";

/** One published+measured post, reduced to its latest snapshot for reporting. */
export interface ReportSnapshotRow {
  platform: Platform;
  metrics: PostMetrics;
  idea?: string;
  capturedAt: Date;
}

/** Per-platform rollup in a report. */
export interface PlatformAgg {
  platform: Platform;
  posts: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface TopPost {
  idea: string;
  platform: Platform;
  impressions: number;
  engagement: number;
}

/** A client performance report over a window. Deterministic, JSON-serialisable. */
export interface PerformanceReport {
  clientId: string;
  clientName: string;
  periodDays: number;
  generatedAt: string; // ISO-8601
  totals: { posts: number; impressions: number; likes: number; comments: number; shares: number };
  byPlatform: PlatformAgg[];
  topPosts: TopPost[];
}

/** A client + recipient to email a scheduled digest to. */
export interface DigestTarget {
  agencyId: string;
  clientId: string;
  clientName: string;
  recipient: string;
}

/** Sends a rendered report email. Implementations: HTTP endpoint, fake. */
export type ReportSender = (msg: {
  to: string;
  subject: string;
  html: string;
}) => Promise<void>;

/** Read side of reporting, tenant-scoped. Implementations: fake, Prisma. */
export interface ReportStore {
  /** Published+measured posts for a client since `since`, latest snapshot each. */
  snapshotsForClient(
    agencyId: string,
    clientId: string,
    since: Date,
  ): Promise<ReportSnapshotRow[]>;
  /** Every client whose agency has a digest recipient (branding.supportEmail). */
  digestTargets(): Promise<DigestTarget[]>;
}
