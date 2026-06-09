// Design Director (P3-08) — types for the specialist-agents design path. A
// director agent sets the creative direction, then specialist agents (copy,
// colour, imagery) each contribute their part within that direction, and the
// director composes the parts into one DesignSpec. Modelled on Lovart's
// specialist-agents pattern (docs/05 Phase 3).

/** Output of the art-director agent: the overall creative direction. */
export interface ArtDirection {
  concept: string;
  mood: string[];
  composition: string;
}

/** In-image copy blocks (distinct from the Copy Engine's post caption). */
export interface DesignCopy {
  headline: string;
  subheadline: string;
  cta: string;
}

/** Palette role assignment, grounded in the brand palette. */
export interface DesignColors {
  background: string;
  foreground: string;
  accent: string;
}

/** The composed brief the Creative Studio can render from. */
export interface DesignSpec {
  concept: string;
  mood: string[];
  composition: string;
  copy: DesignCopy;
  colors: DesignColors;
  imagePrompt: string;
  /** LLM model that produced the spec (recorded for the audit trail). */
  model: string;
}

/** Brand context fed to every specialist. */
export interface DesignBrandContext {
  palette: string[]; // hex
  fonts: string[];
  voice: unknown;
}

export interface DesignItemRecord {
  id: string;
  clientId: string;
  copy: unknown; // raw StoredCopy JSON — carries the plan brief
}

export interface DesignItemStore {
  /** Tenant-scoped read: resolves the item only if it belongs to the agency. */
  findForAgency(agencyId: string, itemId: string): Promise<DesignItemRecord | null>;
  /** Tenant-scoped write of the design spec JSON; false if nothing matched. */
  saveSpec(agencyId: string, itemId: string, spec: DesignSpec): Promise<boolean>;
}
