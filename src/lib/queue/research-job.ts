// Research job handler — the pure function the BullMQ worker runs. Fully injectable
// so it is testable without Redis. AUDIT-EXEMPT comment does NOT apply here —
// the ResearchService calls withAudit internally for every LLM synthesize call.
import type { TenantContext } from "@/lib/db/tenancy";
import type { ResearchService } from "@/lib/research";

export interface ResearchJobData {
  agencyId: string;
  clientId: string;
  seedUrls?: string[];
}

export interface ResearchJobDeps {
  research: ResearchService;
}

export async function runResearchJob(
  deps: ResearchJobDeps,
  data: ResearchJobData,
): Promise<void> {
  const ctx: TenantContext = { agencyId: data.agencyId };
  await deps.research.synthesize(ctx, {
    clientId: data.clientId,
    seedUrls: data.seedUrls,
  });
}
