// LinkedIn publisher adapter — talks straight to LinkedIn's official OAuth +
// UGC Posts API (no aggregator). Text posts for MVP; media upload (register +
// upload) is Phase 2. The fetch is injectable for tests.
import { ExternalServiceError } from "@/lib/errors/app-error";
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

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const UGC_URL = "https://api.linkedin.com/v2/ugcPosts";
const SCOPE = "openid profile w_member_social";

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export class LinkedInPublisher implements Publisher {
  readonly platform: Platform = "linkedin";
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: LinkedInConfig) {
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
      throw new ExternalServiceError(`LinkedIn token exchange failed (${tokenRes.status})`);
    }
    const token = (await tokenRes.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!token.access_token) throw new ExternalServiceError("LinkedIn returned no access token");

    const meRes = await this.fetchFn(USERINFO_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) {
      throw new ExternalServiceError(`LinkedIn profile lookup failed (${meRes.status})`);
    }
    const me = (await meRes.json()) as { sub?: string; name?: string };
    if (!me.sub) throw new ExternalServiceError("LinkedIn profile had no subject id");

    return {
      externalId: `urn:li:person:${me.sub}`,
      ...(me.name ? { handle: me.name } : {}),
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in
        ? { expiresAt: new Date(this.now() + token.expires_in * 1000) }
        : {}),
    };
  }

  async publish({ accessToken, authorId, caption, mediaUrls }: PublishInput): Promise<PublishResult> {
    if (mediaUrls && mediaUrls.length > 0) {
      // Media requires register-upload + asset URN flow — Phase 2. Fail loudly
      // rather than silently dropping the media.
      throw new ExternalServiceError("LinkedIn media posts are not supported yet (Phase 2)");
    }
    const body = {
      author: authorId,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
    const res = await this.fetchFn(UGC_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-restli-protocol-version": "2.0.0",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ExternalServiceError(`LinkedIn publish failed (${res.status})`);
    }
    const headerId = res.headers.get("x-restli-id");
    const id = headerId ?? ((await res.json().catch(() => ({}))) as { id?: string }).id;
    if (!id) throw new ExternalServiceError("LinkedIn publish returned no post id");
    return { externalId: id, permalink: `https://www.linkedin.com/feed/update/${id}` };
  }

  async fetchMetrics(_ref: PostRef): Promise<AnalyticsSnapshotData> {
    // Phase 2: socialActions / organizationalEntityShareStatistics.
    throw new ExternalServiceError("LinkedIn metrics are not implemented yet (Phase 2)");
  }
}
