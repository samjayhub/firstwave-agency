// Performance learning loop (P4-02). Reads a client's published posts + their
// latest analytics snapshots and distills them into a PerformanceBrief that the
// Content Planner injects, so each new plan is grounded in what actually
// performed — closing the architecture's #10 (analytics) -> #5 (planner) loop,
// which was drawn but never wired.
//
// AUDIT-EXEMPT: this service only reads metrics and runs deterministic ranking
// (see ./metrics). The generative step it feeds — the planner — stays audited.
import type { TenantContext } from "@/lib/db/tenancy";
import { summarizePerformance } from "./metrics";
import type {
  PerformanceBrief,
  PerformanceProvider,
  PerformanceStore,
} from "./types";

export * from "./types";
export { engagementScore, summarizePerformance } from "./metrics";

export interface PerformanceServiceDeps {
  store: PerformanceStore;
  /** How many recent published posts to sample per brief. Default 50. */
  sampleLimit?: number;
}

export class PerformanceService implements PerformanceProvider {
  private readonly sampleLimit: number;

  constructor(private readonly deps: PerformanceServiceDeps) {
    this.sampleLimit = deps.sampleLimit ?? 50;
  }

  /** Provider hook the planner calls: agency-scoped, null when nothing measured. */
  async briefForClient(
    agencyId: string,
    clientId: string,
  ): Promise<PerformanceBrief | null> {
    const records = await this.deps.store.recentPerformance(
      agencyId,
      clientId,
      this.sampleLimit,
    );
    return summarizePerformance(records);
  }

  /** Same brief via a TenantContext, for the read route. */
  brief(ctx: TenantContext, clientId: string): Promise<PerformanceBrief | null> {
    return this.briefForClient(ctx.agencyId, clientId);
  }
}
