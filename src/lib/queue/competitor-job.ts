// Competitor job handler — the pure function the BullMQ worker runs. Fully
// injectable so it is testable without Redis. The CompetitorService calls
// withAudit internally for the LLM synthesis, so no audit logic lives here.
import type { TenantContext } from "@/lib/db/tenancy";
import type { CompetitorService } from "@/lib/competitor";
import type { Platform } from "@/lib/publishers/types";

export interface CompetitorJobData {
  agencyId: string;
  clientId: string;
  competitors: Array<{ url: string; platform?: Platform }>;
}

export interface CompetitorJobDeps {
  competitor: CompetitorService;
}

export async function runCompetitorJob(
  deps: CompetitorJobDeps,
  data: CompetitorJobData,
): Promise<void> {
  const ctx: TenantContext = { agencyId: data.agencyId };
  await deps.competitor.analyze(ctx, {
    clientId: data.clientId,
    competitors: data.competitors,
  });
}
