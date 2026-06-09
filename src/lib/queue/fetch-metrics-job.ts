// Fetch-metrics job handler — the pure function the BullMQ worker runs. Fully
// injectable so it is testable without Redis. AUDIT-EXEMPT: analytics is a
// rule-based (non-LLM) action; the AnalyticsSnapshot row IS its audit trail.
import type { TenantContext } from "@/lib/db/tenancy";
import type { AnalyticsService } from "@/lib/analytics";

export interface FetchMetricsJobData {
  agencyId: string;
  publishJobId: string;
}

export interface FetchMetricsJobDeps {
  analytics: AnalyticsService;
}

export async function runFetchMetricsJob(
  deps: FetchMetricsJobDeps,
  data: FetchMetricsJobData,
): Promise<void> {
  const ctx: TenantContext = { agencyId: data.agencyId };
  await deps.analytics.refresh(ctx, data.publishJobId);
}
