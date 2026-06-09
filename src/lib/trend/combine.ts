// Fan-in for the Trend Engine (P4-05). The architecture's module #4 specified
// three trend sources (Google Trends + TikTok Creative Center + YouTube
// trending); only Google Trends shipped. combineSources runs several TrendSources
// for one sweep and merges their observations into a single feed, deduping by
// topic (keeping the strongest signal and unioning sample refs).
//
// Resilience: each source runs independently; an individual source failing (an
// unofficial endpoint drifting, a quota blip) is logged and skipped, not fatal —
// as long as ONE source returns data the sweep still produces a feed. It only
// throws when every source fails.
import { ExternalServiceError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import type { TrendFeed, TrendObservation, TrendSource } from "./types";

/** Merge same-topic observations: max volume/growth, union of sample refs. */
export function mergeObservations(observations: TrendObservation[]): TrendObservation[] {
  const byTopic = new Map<string, TrendObservation>();
  for (const obs of observations) {
    const key = obs.topic.trim().toLowerCase();
    if (!key) continue;
    const existing = byTopic.get(key);
    if (!existing) {
      byTopic.set(key, { ...obs, sampleRefs: [...(obs.sampleRefs ?? [])] });
      continue;
    }
    existing.volume = Math.max(existing.volume, obs.volume);
    existing.growth = Math.max(existing.growth, obs.growth);
    const refs = new Set([...(existing.sampleRefs ?? []), ...(obs.sampleRefs ?? [])]);
    existing.sampleRefs = [...refs].slice(0, 5);
  }
  return [...byTopic.values()];
}

/**
 * Compose N TrendSources into one. Sources run concurrently; failures are
 * tolerated unless all fail. Requires at least one source.
 */
export function combineSources(...sources: TrendSource[]): TrendSource {
  if (sources.length === 0) {
    throw new Error("combineSources requires at least one source");
  }

  return async (input): Promise<TrendFeed> => {
    const settled = await Promise.allSettled(sources.map((s) => s(input)));

    const observations: TrendObservation[] = [];
    let succeeded = 0;
    for (const result of settled) {
      if (result.status === "fulfilled") {
        succeeded += 1;
        observations.push(...result.value.observations);
      } else {
        logger.warn("trend source failed; skipping", {
          message:
            result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    if (succeeded === 0) {
      throw new ExternalServiceError("All trend sources failed");
    }

    return { platform: input.platform, observations: mergeObservations(observations) };
  };
}
