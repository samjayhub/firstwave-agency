// In-memory ContentPlanStore + ContentItemStore for planner/copy tests.
import type { ContentPlanStore, NewPlanItem } from "@/lib/planner";
import type { ContentItemStore } from "@/lib/copy";
import type { StoredCopy } from "@/lib/content/types";

interface ItemRow {
  id: string;
  agencyId: string;
  clientId: string;
  planId: string;
  copy: StoredCopy;
  scheduledAt?: Date;
}

export class FakeContentPlanStore implements ContentPlanStore {
  readonly plans: Array<{ planId: string; agencyId: string; clientId: string; startDate: Date }> = [];
  readonly items: ItemRow[] = [];
  private pSeq = 0;
  private iSeq = 0;

  async createPlanWithItems(
    agencyId: string,
    clientId: string,
    startDate: Date,
    items: NewPlanItem[],
  ) {
    const planId = `plan_${++this.pSeq}`;
    this.plans.push({ planId, agencyId, clientId, startDate });
    const out = items.map((it) => {
      const id = `item_${++this.iSeq}`;
      this.items.push({ id, agencyId, clientId, planId, copy: it.copy, scheduledAt: it.scheduledAt });
      return { contentItemId: id, brief: it.copy.brief };
    });
    return { planId, items: out };
  }

  async latestForClient(agencyId: string, clientId: string) {
    const plan = [...this.plans]
      .reverse()
      .find((p) => p.clientId === clientId && p.agencyId === agencyId);
    if (!plan) return null;
    return {
      planId: plan.planId,
      startDate: plan.startDate,
      items: this.items
        .filter((i) => i.planId === plan.planId)
        .map((i) => ({ contentItemId: i.id, copy: i.copy as StoredCopy | null })),
    };
  }
}

export class FakeContentItemStore implements ContentItemStore {
  private readonly rows = new Map<string, ItemRow>();

  seed(row: ItemRow): void {
    this.rows.set(row.id, { ...row });
  }

  async findForAgency(agencyId: string, itemId: string) {
    const row = this.rows.get(itemId);
    if (!row || row.agencyId !== agencyId) return null;
    return { id: row.id, clientId: row.clientId, copy: row.copy };
  }

  async updateCopy(agencyId: string, itemId: string, copy: StoredCopy) {
    const row = this.rows.get(itemId);
    if (!row || row.agencyId !== agencyId) return false;
    row.copy = copy;
    return true;
  }
}
