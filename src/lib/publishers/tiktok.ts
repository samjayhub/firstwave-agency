// TikTok publisher adapter — TikTok Login Kit (OAuth v2) + the official Content
// Posting API. Publishing uses Direct Post with PULL_FROM_URL: we hand TikTok
// the produced video's URL and it pulls + posts it, returning a publish id.
// The fetch is injectable for tests. Content Posting responses wrap payloads in
// { data, error:{ code, message } } — code "ok" means success even on HTTP 200.
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

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USERINFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const PUBLISH_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const VIDEO_QUERY_URL = "https://open.tiktokapis.com/v2/video/query/";
const SCOPE = "user.info.basic,video.publish";
const MAX_TITLE = 150;

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

export class TikTokPublisher implements Publisher {
  readonly platform: Platform = "tiktok";
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: TikTokConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  /** POST JSON to a Content Posting endpoint and unwrap the { data, error } envelope. */
  private async postEnvelope<T>(url: string, accessToken: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new ExternalServiceError(`TikTok API error (${res.status})`);
    const env = (await res.json()) as TikTokEnvelope<T>;
    if (env.error && env.error.code && env.error.code !== "ok") {
      throw new ExternalServiceError(`TikTok rejected the request (${env.error.code})`);
    }
    if (env.data === undefined) throw new ExternalServiceError("TikTok returned no data");
    return env.data;
  }

  authorizeUrl({ redirectUri, state }: AuthorizeUrlParams): string {
    const params = new URLSearchParams({
      client_key: this.config.clientKey,
      response_type: "code",
      scope: SCOPE,
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(authCode: string, redirectUri: string): Promise<ConnectionResult> {
    const tokenRes = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.config.clientKey,
        client_secret: this.config.clientSecret,
        code: authCode,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new ExternalServiceError(`TikTok token exchange failed (${tokenRes.status})`);
    }
    const token = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
    };
    if (!token.access_token || !token.open_id) {
      throw new ExternalServiceError("TikTok returned no access token / open_id");
    }

    // Best-effort display name for the handle.
    let handle: string | undefined;
    const meRes = await this.fetchFn(`${USERINFO_URL}?fields=open_id,display_name`, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as TikTokEnvelope<{ user?: { display_name?: string } }>;
      handle = me.data?.user?.display_name;
    }

    return {
      externalId: token.open_id,
      ...(handle ? { handle } : {}),
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in
        ? { expiresAt: new Date(this.now() + token.expires_in * 1000) }
        : {}),
    };
  }

  async publish({ accessToken, caption, mediaUrls }: PublishInput): Promise<PublishResult> {
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new ValidationError("TikTok requires a video file — no media provided");
    }
    const data = await this.postEnvelope<{ publish_id?: string }>(
      PUBLISH_INIT_URL,
      accessToken,
      {
        post_info: {
          title: caption.slice(0, MAX_TITLE),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_comment: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: mediaUrls[0],
        },
      },
    );
    if (!data.publish_id) throw new ExternalServiceError("TikTok publish returned no publish id");
    // The public video id / permalink is only known once TikTok finishes
    // processing (polled via the status endpoint, surfaced by the analytics loop).
    return { externalId: data.publish_id };
  }

  async fetchMetrics({ accessToken, externalId }: PostRef): Promise<AnalyticsSnapshotData> {
    const data = await this.postEnvelope<{
      videos?: Array<{
        view_count?: number;
        like_count?: number;
        comment_count?: number;
        share_count?: number;
      }>;
    }>(
      `${VIDEO_QUERY_URL}?fields=id,view_count,like_count,comment_count,share_count`,
      accessToken,
      { filters: { video_ids: [externalId] } },
    );
    const v = data.videos?.[0];
    if (!v) throw new ExternalServiceError("TikTok returned no video for the id");
    return {
      impressions: v.view_count ?? 0,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
      capturedAt: new Date(this.now()),
    };
  }
}
