// Publisher registry — resolve the official-API adapter for a platform.
import { requireEnv } from "@/lib/config/env";
import { ValidationError } from "@/lib/errors/app-error";
import type { Platform, Publisher } from "./types";
import { LinkedInPublisher } from "./linkedin";

export function getPublisher(platform: Platform): Publisher {
  switch (platform) {
    case "linkedin":
      return new LinkedInPublisher({
        clientId: requireEnv("LINKEDIN_CLIENT_ID"),
        clientSecret: requireEnv("LINKEDIN_CLIENT_SECRET"),
      });
    default:
      // meta_ig/meta_fb/youtube/tiktok/pinterest = Phase 2; x = paid (deferred).
      throw new ValidationError(`No publisher adapter for platform "${platform}"`);
  }
}

export type { Publisher, Platform } from "./types";
