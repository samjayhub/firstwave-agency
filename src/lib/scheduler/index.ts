// Scheduling engine (P4-01) — a clock-driven tick that auto-publishes approved
// content items once their `scheduledAt` has arrived. Closes the gap where
// `ContentItem.scheduledAt` was only metadata: publishing used to require a
// manual API call. The tick finds due approved items, flips each
// approved → scheduled (the same human gate the publish worker re-checks), and
// enqueues a publish job for the item's target account.
//
// The flip is a conditional update, so two concurrent ticks can't double-enqueue
// one item. Per-item failures are isolated — one bad enqueue never aborts the
// rest of the batch.
//
// AUDIT-EXEMPT: scheduling is a rule-based (non-LLM) action; the PublishJob row
// each enqueue produces IS its audit trail.
import { logger } from "@/lib/logger";
import type { PublishJobData } from "@/lib/publish/job";
import type { DueItem, SchedulerStore } from "./types";

export * from "./types";

export interface SchedulerDeps {
  store: SchedulerStore;
  /** Enqueue a publish job (injected so the engine stays Redis-free in tests). */
  enqueue: (data: PublishJobData) => Promise<string>;
  clock?: () => Date;
}

export interface TickOptions {
  /** Max items to process this tick (bounds one tick's work). Default 50. */
  limit?: number;
  /** Restrict to one agency (manual ops trigger); omit for the global cron tick. */
  agencyId?: string;
}

export interface TickResult {
  /** How many due items the store returned. */
  due: number;
  /** How many were flipped to `scheduled` and enqueued this tick. */
  scheduled: number;
  itemIds: string[];
}

export class SchedulerService {
  private readonly clock: () => Date;

  constructor(private readonly deps: SchedulerDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Run one scheduling pass: enqueue every item whose scheduled time has come. */
  async tick(opts: TickOptions = {}): Promise<TickResult> {
    const limit = opts.limit ?? 50;
    const now = this.clock();
    const due = await this.deps.store.findDueItems(now, limit, opts.agencyId);

    const itemIds: string[] = [];
    for (const item of due) {
      // Lose the race? Another tick already claimed it — skip without enqueueing.
      const claimed = await this.deps.store.markScheduled(item.agencyId, item.itemId);
      if (!claimed) continue;
      try {
        await this.enqueueOne(item);
        itemIds.push(item.itemId);
      } catch (err) {
        // The item is now `scheduled` with no job; leave it for ops to re-fire
        // rather than aborting the rest of the batch.
        logger.error("scheduler failed to enqueue due item", {
          itemId: item.itemId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { due: due.length, scheduled: itemIds.length, itemIds };
  }

  private async enqueueOne(item: DueItem): Promise<void> {
    await this.deps.enqueue({
      agencyId: item.agencyId,
      itemId: item.itemId,
      connectedAccountId: item.connectedAccountId,
    });
  }
}
