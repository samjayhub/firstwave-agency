// Brand Intelligence — in-house extraction (replaces Brandfetch).
// Playwright crawl → node-vibrant palette + @font-face parse + logo heuristic
// → LLM voice analysis. See docs/02-architecture.md §3 (module 1).
//
// Phase 0: types only.

export interface PaletteColor {
  hex: string;
  role: "primary" | "secondary" | "accent" | "background" | "text";
}

export interface BrandFont {
  family: string;
  role: "heading" | "body" | "other";
}

export interface BrandVoice {
  tone: string[]; // e.g. ["confident", "warm", "concise"]
  themes: string[];
  audience: string;
  dos: string[];
  donts: string[];
}

export interface BrandProfileData {
  palette: PaletteColor[];
  fonts: BrandFont[];
  logoUrl?: string;
  voice: BrandVoice;
}

export interface ExtractInput {
  clientId: string;
  websiteUrl: string;
  /** TODO(phase-2): fetch + use public social URLs to ground the voice analysis.
   *  Not consumed yet, so it is intentionally NOT accepted at the route boundary. */
  socialUrls?: string[];
}
