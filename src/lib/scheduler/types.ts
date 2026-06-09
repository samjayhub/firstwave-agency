import type { Platform } from "@/lib/publishers/types";

/** A due content item resolved to the one target account it should publish to. */
export interface DueItem {
  agencyId: string;
  itemId: string;
  /** The connected account to publish through (the item's first target). */
  connectedAccountId: string;
  platform: Platform;
}

/**
 * Persistence for the scheduling engine. Tenant scope is optional: the cron tick
 * runs across all agencies (agencyId undefined); the manual ops trigger passes
 * the caller's agency so an admin only fires their own due items.
 * Implementations: in-memory fake, Prisma.
 */
export interface SchedulerStore {
  /**
   * Approved items whose `scheduledAt` has arrived (`<= now`) and that have at
   * least one target account — resolved to that first target. Newest-due first,
   * capped at `limit`.
   */
  findDueItems(now: Date, limit: number, agencyId?: string): Promise<DueItem[]>;
  /**
   * Conditional `approved → scheduled` flip (the human gate the publish worker
   * still re-checks). Returns false if the item already left `approved`, so two
   * concurrent ticks can't double-enqueue the same item.
   */
  markScheduled(agencyId: string, itemId: string): Promise<boolean>;
}
