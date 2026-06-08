// Production TrendSource backed by Google Trends' public Daily Trends RSS feed
// (no API key, free). It returns the day's breakout searches for a geo; we parse
// each item's approximate traffic as the volume signal and use feed position as a
// momentum proxy (the feed is ordered most-breakout-first), then keep the items
// whose text overlaps the niche/keywords. The only host reached is trends.google.com.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { Platform } from "@/lib/publishers/types";
import type { TrendFeed, TrendObservation, TrendSource } from "./types";

const RSS_BASE = "https://trends.google.com/trends/trendingsearches/daily/rss";
const DEFAULT_GEO = "US";

type FetchImpl = typeof fetch;

/** "50,000+" / "1,200" → 50000 / 1200. Returns 0 when unparseable. */
export function parseApproxTraffic(raw: string | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function firstTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXml(m[1]!) : undefined;
}

function allTags(block: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(decodeXml(m[1]!));
  return out;
}

/** Parse the Daily Trends RSS XML into raw observations (position = momentum proxy). */
export function parseDailyTrendsRss(xml: string): TrendObservation[] {
  const items = allTags(xml, "item");
  const total = items.length;
  return items.map((block, i) => {
    const topic = firstTag(block, "title") ?? "(unknown)";
    const volume = parseApproxTraffic(firstTag(block, "ht:approx_traffic"));
    // The feed is ordered most-breakout-first; map position to a 0–1 growth proxy
    // (top item = strongest rising signal). These ARE breakout searches by definition.
    const growth = total > 1 ? (total - i - 1) / (total - 1) : 1;
    const sampleRefs = allTags(block, "ht:news_item_url").slice(0, 3);
    return { topic, volume, growth, sampleRefs };
  });
}

function matchesNiche(obs: TrendObservation, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = `${obs.topic} ${obs.sampleRefs?.join(" ") ?? ""}`.toLowerCase();
  return terms.some((t) => hay.includes(t));
}

export interface GoogleTrendsOptions {
  geo?: string;
  fetchImpl?: FetchImpl;
}

/**
 * Build a Google-Trends-backed TrendSource. `fetchImpl` is injectable for tests.
 * Keeps only observations whose text overlaps the niche/keywords; if none match,
 * falls back to the full breakout feed so a sweep is never empty.
 */
export function googleTrendsSource(opts: GoogleTrendsOptions = {}): TrendSource {
  const geo = opts.geo ?? DEFAULT_GEO;
  const fetchImpl = opts.fetchImpl ?? fetch;

  return async ({ niche, platform, keywords }): Promise<TrendFeed> => {
    const res = await fetchImpl(`${RSS_BASE}?geo=${encodeURIComponent(geo)}`, {
      headers: { "User-Agent": "firstwave-trends/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ExternalServiceError(`Google Trends RSS error (${res.status})`);
    }
    const xml = await res.text();
    const all = parseDailyTrendsRss(xml);

    const terms = [niche, ...keywords]
      .flatMap((t) => t.toLowerCase().split(/\s+/))
      .filter((t) => t.length > 2);
    const matched = all.filter((o) => matchesNiche(o, terms));
    const observations = matched.length > 0 ? matched : all;

    return { platform: platform as Platform, observations };
  };
}
