// In-memory BrandingStore for offline tests — faithful to the unique-per-agency
// and unique-custom-domain constraints the Prisma store enforces.
import type { BrandingPatch, BrandingRecord, BrandingStore } from "@/lib/whitelabel/types";

export class FakeBrandingStore implements BrandingStore {
  private byAgency = new Map<string, BrandingRecord>();

  async getByAgency(agencyId: string): Promise<BrandingRecord | null> {
    return this.byAgency.get(agencyId) ?? null;
  }

  async getByCustomDomain(domain: string): Promise<BrandingRecord | null> {
    for (const rec of this.byAgency.values()) {
      if (rec.customDomain === domain) return rec;
    }
    return null;
  }

  async upsertByAgency(agencyId: string, patch: BrandingPatch): Promise<BrandingRecord> {
    const current: BrandingRecord =
      this.byAgency.get(agencyId) ?? {
        agencyId,
        brandName: null,
        logoUrl: null,
        primaryColor: null,
        supportEmail: null,
        customDomain: null,
      };
    const next: BrandingRecord = { ...current, ...patch };
    this.byAgency.set(agencyId, next);
    return next;
  }
}
