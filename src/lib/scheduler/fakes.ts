// In-memory SchedulerStore for offline tests — mirrors the Prisma store's
// due-item selection and conditional approved → scheduled flip.
import type { Platform } from "@/lib/publishers/types";
import type { DueItem, SchedulerStore } from "./types";

export interface FakeScheduledItem {
  agencyId: string;
  itemId: string;
  connectedAccountId: string;
  platform: Platform;
  status: "draft" | "in_review" | "approved" | "scheduled" | "published" | "failed";
  scheduledAt: Date | null;
}

export class FakeSchedulerStore implements SchedulerStore {
  constructor(public items: FakeScheduledItem[] = []) {}

  async findDueItems(now: Date, limit: number, agencyId?: string): Promise<DueItem[]> {
    return this.items
      .filter(
        (i) =>
          i.status === "approved" &&
          i.scheduledAt !== null &&
          i.scheduledAt.getTime() <= now.getTime() &&
          (agencyId === undefined || i.agencyId === agencyId),
      )
      .sort((a, b) => (a.scheduledAt!.getTime() - b.scheduledAt!.getTime()))
      .slice(0, limit)
      .map((i) => ({
        agencyId: i.agencyId,
        itemId: i.itemId,
        connectedAccountId: i.connectedAccountId,
        platform: i.platform,
      }));
  }

  async markScheduled(agencyId: string, itemId: string): Promise<boolean> {
    const item = this.items.find(
      (i) => i.itemId === itemId && i.agencyId === agencyId && i.status === "approved",
    );
    if (!item) return false;
    item.status = "scheduled";
    return true;
  }
}
