// TrendSource backed by the YouTube Data API v3 "mostPopular" chart (free, the
// same key Competitor Intelligence uses). Returns the region's currently-popular
// videos as trend observations: title = topic, view count = volume, and the
// chart position as a momentum proxy (top of the chart = strongest signal).
// Only the googleapis host is reached.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { Platform } from "@/lib/publishers/types";
import type { TrendFeed, TrendObservation, TrendSource } from "./types";

const API = "https://www.googleapis.com/youtube/v3/videos";
const DEFAULT_REGION = "US";

type FetchImpl = typeof fetch;

interface YtVideo {
  id?: string;
  snippet?: { title?: string; tags?: string[] };
  statistics?: { viewCount?: string };
}
interface YtResponse {
  items?: YtVideo[];
}

/** Parse a videos.list response into observations (position = momentum proxy). */
export function parseYoutubeTrending(json: unknown): TrendObservation[] {
  const items = (json as YtResponse)?.items;
  if (!Array.isArray(items)) return [];
  const total = items.length;
  return items
    .map((v, i): TrendObservation | null => {
      const topic = v.snippet?.title?.trim();
      if (!topic) return null;
      const volume = Number(v.statistics?.viewCount ?? 0) || 0;
      // The chart is ordered most-popular-first; map rank to a 0–1 growth proxy.
      const growth = total > 1 ? (total - i - 1) / (total - 1) : 1;
      const sampleRefs = v.id ? [`https://www.youtube.com/watch?v=${v.id}`] : [];
      return { topic, volume, growth, sampleRefs };
    })
    .filter((o): o is TrendObservation => o !== null);
}

function matchesNiche(obs: TrendObservation, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = obs.topic.toLowerCase();
  return terms.some((t) => hay.includes(t));
}

export interface YoutubeTrendingOptions {
  apiKey: string;
  regionCode?: string;
  fetchImpl?: FetchImpl;
}

/**
 * Build a YouTube-trending TrendSource. Keeps observations whose title overlaps
 * the niche/keywords; falls back to the full chart so a sweep is never empty.
 */
export function youtubeTrendingSource(opts: YoutubeTrendingOptions): TrendSource {
  const region = opts.regionCode ?? DEFAULT_REGION;
  const fetchImpl = opts.fetchImpl ?? fetch;

  return async ({ niche, platform, keywords }): Promise<TrendFeed> => {
    const url =
      `${API}?part=snippet,statistics&chart=mostPopular&maxResults=50` +
      `&regionCode=${encodeURIComponent(region)}&key=${encodeURIComponent(opts.apiKey)}`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "firstwave-trends/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ExternalServiceError(`YouTube trending API error (${res.status})`);
    }
    const all = parseYoutubeTrending(await res.json());

    const terms = [niche, ...keywords]
      .flatMap((t) => t.toLowerCase().split(/\s+/))
      .filter((t) => t.length > 2);
    const matched = all.filter((o) => matchesNiche(o, terms));
    const observations = matched.length > 0 ? matched : all;

    return { platform: platform as Platform, observations };
  };
}
