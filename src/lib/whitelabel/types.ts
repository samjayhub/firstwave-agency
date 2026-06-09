// White-label — the persistence boundary for an agency's branding. The service
// holds the read/update logic and depends on this narrow store (not Prisma) so it
// is testable against a fake.

export interface BrandingRecord {
  agencyId: string;
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  customDomain: string | null;
}

/** Fields an update may set. Each is independently optional. */
export interface BrandingPatch {
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  supportEmail?: string | null;
  customDomain?: string | null;
}

/** Display-safe subset exposed to unauthenticated client-facing surfaces. */
export interface PublicBranding {
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface BrandingStore {
  getByAgency(agencyId: string): Promise<BrandingRecord | null>;
  /** Resolve display-safe branding by custom domain (client-facing routing). */
  getByCustomDomain(domain: string): Promise<BrandingRecord | null>;
  /** Create the agency's branding row if absent, else patch it. */
  upsertByAgency(agencyId: string, patch: BrandingPatch): Promise<BrandingRecord>;
}
