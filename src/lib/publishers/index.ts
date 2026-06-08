// Publisher registry — resolve the official-API adapter for a platform.
import { requireEnv } from "@/lib/config/env";
import { ValidationError } from "@/lib/errors/app-error";
import type { Platform, Publisher } from "./types";
import { LinkedInPublisher } from "./linkedin";
import { MetaPublisher } from "./meta";
import { YouTubePublisher } from "./youtube";

export function getPublisher(platform: Platform): Publisher {
  switch (platform) {
    case "linkedin":
      return new LinkedInPublisher({
        clientId: requireEnv("LINKEDIN_CLIENT_ID"),
        clientSecret: requireEnv("LINKEDIN_CLIENT_SECRET"),
      });
    case "meta_fb":
    case "meta_ig":
      return new MetaPublisher({
        platform,
        appId: requireEnv("META_APP_ID"),
        appSecret: requireEnv("META_APP_SECRET"),
      });
    case "youtube":
      return new YouTubePublisher({
        clientId: requireEnv("YOUTUBE_CLIENT_ID"),
        clientSecret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      });
    default:
      // tiktok/pinterest = later Phase 2; x = paid (deferred).
      throw new ValidationError(`No publisher adapter for platform "${platform}"`);
  }
}

export type { Publisher, Platform } from "./types";
