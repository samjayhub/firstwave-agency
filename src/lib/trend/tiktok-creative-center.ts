// TrendSource backed by TikTok's Creative Center popular-hashtag feed (public,
// no key). Creative Center exposes trending hashtags with publish/view counts
// and a rank; we map hashtag -> topic, video views -> volume, and the rank
// position to a momentum proxy. This is an UNOFFICIAL endpoint and its shape can
// drift, so the parser is defensive and combineSources tolerates it failing.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { Platform } from "@/lib/publishers/types";
import type { TrendFeed, TrendObservation, TrendSource } from "./types";

const API = "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list";
const DEFAULT_COUNTRY = "US";

type FetchImpl = typeof fetch;

interface TtHashtag {
  hashtag_name?: string;
  video_views?: number;
  publish_cnt?: number;
  rank?: number;
}
interface TtResponse {
  data?: { list?: TtHashtag[] };
}

/** Parse the Creative Center hashtag list into observations (rank = momentum). */
export function parseTiktokHashtags(json: unknown): TrendObservation[] {
  const list = (json as TtResponse)?.data?.list;
  if (!Array.isArray(list)) return [];
  const total = list.length;
  return list
    .map((h, i): TrendObservation | null => {
      const name = h.hashtag_name?.trim();
      if (!name) return null;
      const topic = name.startsWith("#") ? name : `#${name}`;
      const volume = Number(h.video_views ?? h.publish_cnt ?? 0) || 0;
      // Prefer the API's own rank (1 = hottest); fall back to list position.
      const rank = typeof h.rank === "number" && h.rank > 0 ? h.rank : i + 1;
      const growth = total > 1 ? (total - Math.min(rank, total)) / (total - 1) : 1;
      return { topic, volume, growth, sampleRefs: [] };
    })
    .filter((o): o is TrendObservation => o !== null);
}

function matchesNiche(obs: TrendObservation, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = obs.topic.toLowerCase();
  return terms.some((t) => hay.includes(t));
}

export interface TiktokCreativeCenterOptions {
  country?: string;
  fetchImpl?: FetchImpl;
}

/**
 * Build a TikTok-Creative-Center TrendSource. Keeps hashtags whose text overlaps
 * the niche/keywords; falls back to the full list so a sweep is never empty.
 */
export function tiktokCreativeCenterSource(opts: TiktokCreativeCenterOptions = {}): TrendSource {
  const country = opts.country ?? DEFAULT_COUNTRY;
  const fetchImpl = opts.fetchImpl ?? fetch;

  return async ({ niche, platform, keywords }): Promise<TrendFeed> => {
    const url =
      `${API}?period=7&page=1&limit=50&country_code=${encodeURIComponent(country)}`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "firstwave-trends/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ExternalServiceError(`TikTok Creative Center error (${res.status})`);
    }
    const all = parseTiktokHashtags(await res.json());

    const terms = [niche, ...keywords]
      .flatMap((t) => t.toLowerCase().split(/\s+/))
      .filter((t) => t.length > 2);
    const matched = all.filter((o) => matchesNiche(o, terms));
    const observations = matched.length > 0 ? matched : all;

    return { platform: platform as Platform, observations };
  };
}
