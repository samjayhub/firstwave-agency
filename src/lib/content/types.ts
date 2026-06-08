// Shared content types used by the planner (produces briefs) and the copy engine
// (consumes a brief, produces copy). The stored ContentItem.copy JSON holds a
// StoredCopy.
import type { Platform } from "@/lib/publishers/types";

/** Platforms the MVP can plan/post for (X is deferred — paid API). */
export const PLAN_PLATFORMS: Platform[] = ["linkedin", "meta_ig", "meta_fb", "youtube"];

export interface PlanItemBrief {
  day: number; // 1..days
  platform: Platform;
  pillar: string;
  format: string; // e.g. "text", "image", "carousel", "short-video"
  idea: string; // one-line content idea
}

export interface GeneratedCopy {
  caption: string;
  hook: string;
  hashtags: string[];
  description: string;
}

/** Shape persisted in ContentItem.copy. */
export interface StoredCopy {
  platform: Platform;
  brief: PlanItemBrief;
  generated?: GeneratedCopy;
}
