// Brand Intelligence orchestrator. Phase 0: stub.

import type { BrandProfileData, ExtractInput } from "./types";

/**
 * Crawl the client's site + public social, extract the visual kit, and derive
 * brand voice with an LLM. Produces the BrandProfile reused by every downstream
 * module. $0 recurring — no Brandfetch.
 */
export async function extractBrandProfile(
  _input: ExtractInput,
): Promise<BrandProfileData> {
  // TODO(phase-1):
  //  1. Playwright: load site, collect CSS + images + visible copy.
  //  2. node-vibrant: derive palette from hero/logo imagery.
  //  3. Parse @font-face / computed font-families for typography.
  //  4. Logo heuristic: largest <img> near header / og:image / favicon.
  //  5. LLM: derive voice/tone/themes/audience/do-don't from copy + posts.
  throw new Error("not implemented");
}

export type { BrandProfileData, ExtractInput } from "./types";
