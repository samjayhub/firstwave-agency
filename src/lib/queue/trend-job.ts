// Trend job handler — the pure function the BullMQ worker runs. Fully injectable
// so it is testable without Redis. The TrendService calls withAudit internally
// for the LLM synthesis, so no audit logic lives here.
import type { TenantContext } from "@/lib/db/tenancy";
import type { TrendService } from "@/lib/trend";
import type { Platform } from "@/lib/publishers/types";

export interface TrendJobData {
  agencyId: string;
  clientId: string;
  platform?: Platform;
  keywords?: string[];
}

export interface TrendJobDeps {
  trend: TrendService;
}

export async function runTrendJob(deps: TrendJobDeps, data: TrendJobData): Promise<void> {
  const ctx: TenantContext = { agencyId: data.agencyId };
  await deps.trend.analyze(ctx, {
    clientId: data.clientId,
    platform: data.platform,
    keywords: data.keywords,
  });
}
