// White-label service — an agency themes its client-facing surfaces (the
// shareable reviewer view, outbound emails) with its own name, logo, colour,
// support address and optional custom domain. Settings reads/writes are tenant-
// scoped through TenantContext; the public resolver returns only display-safe
// fields and is the one path reachable without a session.
//
// AUDIT-EXEMPT: rule-based settings, no LLM.
import { assertAgencyId, type TenantContext } from "@/lib/db/tenancy";
import { withDbErrors } from "@/lib/db/errors";
import type { BrandingPatch, BrandingRecord, BrandingStore, PublicBranding } from "./types";

export * from "./types";

export interface WhiteLabelServiceDeps {
  store: BrandingStore;
}

const EMPTY: Omit<BrandingRecord, "agencyId"> = {
  brandName: null,
  logoUrl: null,
  primaryColor: null,
  supportEmail: null,
  customDomain: null,
};

function toPublic(rec: BrandingRecord | null): PublicBranding {
  return {
    brandName: rec?.brandName ?? null,
    logoUrl: rec?.logoUrl ?? null,
    primaryColor: rec?.primaryColor ?? null,
  };
}

export class WhiteLabelService {
  constructor(private readonly deps: WhiteLabelServiceDeps) {}

  /** Full branding for the calling agency. Absent row == all-null defaults. */
  async getSettings(ctx: TenantContext): Promise<BrandingRecord> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const rec = await withDbErrors(() => this.deps.store.getByAgency(agencyId), "AgencyBranding");
    return rec ?? { agencyId, ...EMPTY };
  }

  /** Apply a partial branding update for the calling agency. */
  async updateSettings(ctx: TenantContext, patch: BrandingPatch): Promise<BrandingRecord> {
    const agencyId = assertAgencyId(ctx.agencyId);
    return withDbErrors(
      () => this.deps.store.upsertByAgency(agencyId, patch),
      "AgencyBranding",
    );
  }

  /** Display-safe branding for a specific agency (client-facing theming). */
  async resolvePublic(agencyId: string): Promise<PublicBranding> {
    const rec = await withDbErrors(() => this.deps.store.getByAgency(agencyId), "AgencyBranding");
    return toPublic(rec);
  }

  /** Display-safe branding resolved from a custom domain (vanity routing). */
  async resolvePublicByDomain(domain: string): Promise<PublicBranding> {
    const rec = await withDbErrors(
      () => this.deps.store.getByCustomDomain(domain),
      "AgencyBranding",
    );
    return toPublic(rec);
  }
}
