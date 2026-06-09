// Fetch-metrics job handler — the pure function the BullMQ worker runs. Fully
// injectable so it is testable without Redis. AUDIT-EXEMPT: analytics is a
// rule-based (non-LLM) action; the AnalyticsSnapshot row IS its audit trail.
import type { TenantContext } from "@/lib/db/tenancy";
import type { AnalyticsService, StoredSnapshot } from "@/lib/analytics";

export interface FetchMetricsJobData {
  agencyId: string;
  publishJobId: string;
}

export interface FetchMetricsJobDeps {
  analytics: AnalyticsService;
}

/** Refresh + persist metrics; returns the snapshot so callers can alert on it. */
export async function runFetchMetricsJob(
  deps: FetchMetricsJobDeps,
  data: FetchMetricsJobData,
): Promise<StoredSnapshot> {
  const ctx: TenantContext = { agencyId: data.agencyId };
  return deps.analytics.refresh(ctx, data.publishJobId);
}
