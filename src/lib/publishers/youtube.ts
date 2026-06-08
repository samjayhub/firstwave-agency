// YouTube publisher adapter — Google OAuth + the official YouTube Data API v3.
// Publishing a video uses the documented resumable-upload flow: initiate a
// session (metadata + X-Upload-Content-Type) → PUT the bytes to the returned
// session URL. Video bytes are fetched from the approved item's media URL.
// The fetch is injectable for tests. Long-form video assembly is Phase 3; this
// is the publish/connect/metrics plumbing for an already-produced video file.
import { ExternalServiceError, ValidationError } from "@/lib/errors/app-error";
import type {
  AuthorizeUrlParams,
  ConnectionResult,
  Platform,
  PostRef,
  Publisher,
  PublishInput,
  PublishResult,
  AnalyticsSnapshotData,
} from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const SCOPE = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");
const MAX_TITLE = 100;

export interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export class YouTubePublisher implements Publisher {
  readonly platform: Platform = "youtube";
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: YouTubeConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  authorizeUrl({ redirectUri, state }: AuthorizeUrlParams): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      state,
      scope: SCOPE,
      access_type: "offline", // request a refresh token
      prompt: "consent",
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(authCode: string, redirectUri: string): Promise<ConnectionResult> {
    const tokenRes = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new ExternalServiceError(`Google token exchange failed (${tokenRes.status})`);
    }
    const token = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) throw new ExternalServiceError("Google returned no access token");

    // Resolve the authenticated channel.
    const chRes = await this.fetchFn(`${API_BASE}/channels?part=id,snippet&mine=true`, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!chRes.ok) {
      throw new ExternalServiceError(`YouTube channel lookup failed (${chRes.status})`);
    }
    const ch = (await chRes.json()) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>;
    };
    const channel = ch.items?.[0];
    if (!channel?.id) throw new ExternalServiceError("No YouTube channel on this account");

    return {
      externalId: channel.id,
      ...(channel.snippet?.title ? { handle: channel.snippet.title } : {}),
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in
        ? { expiresAt: new Date(this.now() + token.expires_in * 1000) }
        : {}),
    };
  }

  async publish({ accessToken, caption, mediaUrls }: PublishInput): Promise<PublishResult> {
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new ValidationError("YouTube requires a video file — no media provided");
    }

    // Pull the produced video bytes from our storage.
    const videoRes = await this.fetchFn(mediaUrls[0]!, { signal: AbortSignal.timeout(30_000) });
    if (!videoRes.ok) {
      throw new ExternalServiceError(`Fetching video failed (${videoRes.status})`);
    }
    const contentType = videoRes.headers.get("content-type") ?? "video/*";
    const bytes = await videoRes.arrayBuffer();

    const firstLine = caption.split("\n")[0] ?? caption;
    const metadata = {
      snippet: { title: (firstLine || caption).slice(0, MAX_TITLE), description: caption },
      status: { privacyStatus: "public" },
    };

    // Step 1: initiate a resumable upload session.
    const initRes = await this.fetchFn(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-upload-content-type": contentType,
      },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) {
      throw new ExternalServiceError(`YouTube upload init failed (${initRes.status})`);
    }
    const sessionUrl = initRes.headers.get("location");
    if (!sessionUrl) throw new ExternalServiceError("YouTube upload session had no location");

    // Step 2: PUT the bytes to the session URL.
    const upRes = await this.fetchFn(sessionUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: bytes,
    });
    if (!upRes.ok) {
      throw new ExternalServiceError(`YouTube upload failed (${upRes.status})`);
    }
    const out = (await upRes.json()) as { id?: string };
    if (!out.id) throw new ExternalServiceError("YouTube upload returned no video id");
    return { externalId: out.id, permalink: `https://www.youtube.com/watch?v=${out.id}` };
  }

  async fetchMetrics({ accessToken, externalId }: PostRef): Promise<AnalyticsSnapshotData> {
    const res = await this.fetchFn(
      `${API_BASE}/videos?part=statistics&id=${encodeURIComponent(externalId)}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new ExternalServiceError(`YouTube metrics fetch failed (${res.status})`);
    }
    const data = (await res.json()) as {
      items?: Array<{
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      }>;
    };
    const stats = data.items?.[0]?.statistics;
    if (!stats) throw new ExternalServiceError("YouTube returned no statistics for the video");
    return {
      // Data API exposes views (not impressions) without the Analytics API.
      impressions: Number(stats.viewCount ?? 0),
      likes: Number(stats.likeCount ?? 0),
      comments: Number(stats.commentCount ?? 0),
      capturedAt: new Date(this.now()),
    };
  }
}
