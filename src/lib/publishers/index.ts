// Publisher registry — resolve the official-API adapter for a platform.
import { requireEnv } from "@/lib/config/env";
import { ValidationError } from "@/lib/errors/app-error";
import type { Platform, Publisher } from "./types";
import { LinkedInPublisher } from "./linkedin";
import { MetaPublisher } from "./meta";
import { YouTubePublisher } from "./youtube";
import { TikTokPublisher } from "./tiktok";
import { XPublisher } from "./x";

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
    case "tiktok":
      return new TikTokPublisher({
        clientKey: requireEnv("TIKTOK_CLIENT_KEY"),
        clientSecret: requireEnv("TIKTOK_CLIENT_SECRET"),
      });
    case "x":
      return new XPublisher({
        clientId: requireEnv("X_CLIENT_ID"),
        clientSecret: requireEnv("X_CLIENT_SECRET"),
      });
    default:
      // pinterest = later Phase 3.
      throw new ValidationError(`No publisher adapter for platform "${platform}"`);
  }
}

export type { Publisher, Platform } from "./types";
