// Publisher registry — resolve the adapter for a platform.
// Phase 0: only the MVP platform stub is wired. Add adapters here.

import type { Platform, Publisher } from "./types";
import { LinkedInPublisher } from "./linkedin";

const registry: Partial<Record<Platform, Publisher>> = {
  linkedin: new LinkedInPublisher(),
  // TODO(phase-2): meta_ig, meta_fb, youtube, tiktok, pinterest
  // x is paid API — deferred (see docs/04-integrations.md §2)
};

export function getPublisher(platform: Platform): Publisher {
  const p = registry[platform];
  if (!p) throw new Error(`No publisher adapter registered for "${platform}"`);
  return p;
}

export type { Publisher, Platform } from "./types";
