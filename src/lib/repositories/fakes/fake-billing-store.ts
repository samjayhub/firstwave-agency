// In-memory BillingStore for offline tests — faithful to the unique-per-agency
// and unique-customer-id constraints the Prisma store enforces.
import type {
  BillingStore,
  SubscriptionPatch,
  SubscriptionRecord,
} from "@/lib/billing/types";

export class FakeBillingStore implements BillingStore {
  private byAgency = new Map<string, SubscriptionRecord>();

  async getByAgency(agencyId: string): Promise<SubscriptionRecord | null> {
    return this.byAgency.get(agencyId) ?? null;
  }

  async getByCustomerId(customerId: string): Promise<SubscriptionRecord | null> {
    for (const rec of this.byAgency.values()) {
      if (rec.stripeCustomerId === customerId) return rec;
    }
    return null;
  }

  async upsertByAgency(
    agencyId: string,
    patch: SubscriptionPatch,
  ): Promise<SubscriptionRecord> {
    const current: SubscriptionRecord =
      this.byAgency.get(agencyId) ?? {
        agencyId,
        plan: "free",
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      };
    const next: SubscriptionRecord = { ...current, ...patch };
    this.byAgency.set(agencyId, next);
    return next;
  }
}
