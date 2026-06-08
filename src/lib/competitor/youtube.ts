// Production CompetitorSource backed by the (free) YouTube Data API v3.
// Resolves a channel URL → uploads playlist → recent videos + stats. The only
// external host reached is googleapis.com, so no per-URL SSRF guard is needed —
// the user-supplied URL is parsed for an identifier, never fetched directly.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { CompetitorChannel, CompetitorPost, CompetitorSource } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 20;

/** Pull a channel identifier out of common YouTube URL shapes. */
export function parseChannelRef(
  url: string,
): { type: "id" | "handle" | "user"; value: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    // Bare handle like "@creator".
    if (url.startsWith("@")) return { type: "handle", value: url.slice(1) };
    throw new ExternalServiceError(`Unrecognised YouTube channel URL: ${url}`);
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("@")) return { type: "handle", value: parts[0].slice(1) };
  if (parts[0] === "channel" && parts[1]) return { type: "id", value: parts[1] };
  if ((parts[0] === "user" || parts[0] === "c") && parts[1]) {
    return { type: "user", value: parts[1] };
  }
  throw new ExternalServiceError(`Unrecognised YouTube channel URL: ${url}`);
}

/** ISO-8601 duration (e.g. "PT1M5S") → seconds. */
export function parseDurationSeconds(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

type FetchImpl = typeof fetch;

async function getJson<T>(fetchImpl: FetchImpl, url: string): Promise<T> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new ExternalServiceError(`YouTube API error (${res.status})`);
  }
  return (await res.json()) as T;
}

interface ChannelListResponse {
  items?: Array<{
    snippet?: { customUrl?: string; title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}
interface PlaylistItemsResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
}
interface VideoListResponse {
  items?: Array<{
    snippet?: { title?: string; publishedAt?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }>;
}

async function resolveChannel(
  fetchImpl: FetchImpl,
  apiKey: string,
  url: string,
): Promise<{ uploads: string; handle: string }> {
  const ref = parseChannelRef(url);
  const param =
    ref.type === "id"
      ? `id=${encodeURIComponent(ref.value)}`
      : ref.type === "handle"
        ? `forHandle=${encodeURIComponent(ref.value)}`
        : `forUsername=${encodeURIComponent(ref.value)}`;
  const data = await getJson<ChannelListResponse>(
    fetchImpl,
    `${API_BASE}/channels?part=snippet,contentDetails&${param}&key=${apiKey}`,
  );
  const channel = data.items?.[0];
  const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new ExternalServiceError(`YouTube channel not found: ${url}`);
  const handle = channel?.snippet?.customUrl?.replace(/^@/, "") ?? ref.value;
  return { uploads, handle };
}

/**
 * Build a YouTube-backed CompetitorSource. `fetchImpl` is injectable for tests.
 */
export function youtubeCompetitorSource(
  apiKey: string,
  fetchImpl: FetchImpl = fetch,
): CompetitorSource {
  return async ({ url, platform }): Promise<CompetitorChannel> => {
    const { uploads, handle } = await resolveChannel(fetchImpl, apiKey, url);

    const playlist = await getJson<PlaylistItemsResponse>(
      fetchImpl,
      `${API_BASE}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${MAX_VIDEOS}&key=${apiKey}`,
    );
    const videoIds = (playlist.items ?? [])
      .map((it) => it.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
    if (videoIds.length === 0) {
      return { handle, url, platform, posts: [] };
    }

    const videos = await getJson<VideoListResponse>(
      fetchImpl,
      `${API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}&key=${apiKey}`,
    );
    const posts: CompetitorPost[] = (videos.items ?? []).map((v) => ({
      title: v.snippet?.title ?? "(untitled)",
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      publishedAt: v.snippet?.publishedAt ?? new Date(0).toISOString(),
      durationSec: parseDurationSeconds(v.contentDetails?.duration ?? "PT0S"),
    }));

    return { handle, url, platform, posts };
  };
}
