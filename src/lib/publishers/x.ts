// X (Twitter) publisher adapter — OAuth 2.0 (confidential client) + the X API v2.
// X is the one paid platform on the roadmap; this adapter is only wired up when a
// client actually needs it. Publishing posts a text Tweet via POST /2/tweets and
// metrics come from a Tweet's public_metrics. The fetch is injectable for tests.
//
// PKCE note: X mandates a code_challenge even for confidential clients. Our
// Publisher contract is stateless (authorizeUrl and exchangeCode run on separate
// instances with no shared per-request store), so we use the `plain` method with a
// fixed verifier — the real protection here is the confidential client_secret sent
// as HTTP Basic auth on the token endpoint, not the PKCE secret.
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

const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const ME_URL = "https://api.twitter.com/2/users/me";
const TWEETS_URL = "https://api.twitter.com/2/tweets";
const SCOPE = "tweet.read tweet.write users.read offline.access";
// See the PKCE note above — fixed plain verifier; security rests on client_secret.
const PKCE_VERIFIER = "challenge";
const MAX_TWEET = 280;

export interface XConfig {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export class XPublisher implements Publisher {
  readonly platform: Platform = "x";
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: XConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  /** HTTP Basic credential for the confidential-client token endpoint. */
  private basicAuth(): string {
    return Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
  }

  authorizeUrl({ redirectUri, state }: AuthorizeUrlParams): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: SCOPE,
      state,
      code_challenge: PKCE_VERIFIER,
      code_challenge_method: "plain",
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(authCode: string, redirectUri: string): Promise<ConnectionResult> {
    const tokenRes = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: `Basic ${this.basicAuth()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
        code_verifier: PKCE_VERIFIER,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new ExternalServiceError(`X token exchange failed (${tokenRes.status})`);
    }
    const token = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) throw new ExternalServiceError("X returned no access token");

    const meRes = await this.fetchFn(ME_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new ExternalServiceError(`X profile lookup failed (${meRes.status})`);
    const me = (await meRes.json()) as { data?: { id?: string; username?: string } };
    if (!me.data?.id) throw new ExternalServiceError("X profile had no user id");

    return {
      externalId: me.data.id,
      ...(me.data.username ? { handle: me.data.username } : {}),
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in
        ? { expiresAt: new Date(this.now() + token.expires_in * 1000) }
        : {}),
    };
  }

  async publish({ accessToken, caption, mediaUrls }: PublishInput): Promise<PublishResult> {
    if (mediaUrls && mediaUrls.length > 0) {
      // Media requires the v1.1 chunked upload + media_ids flow — not wired yet.
      throw new ExternalServiceError("X media posts are not supported yet");
    }
    const res = await this.fetchFn(TWEETS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: caption.slice(0, MAX_TWEET) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new ExternalServiceError(`X publish failed (${res.status})`);
    const body = (await res.json()) as { data?: { id?: string } };
    const id = body.data?.id;
    if (!id) throw new ExternalServiceError("X publish returned no tweet id");
    return { externalId: id, permalink: `https://twitter.com/i/web/status/${id}` };
  }

  async fetchMetrics({ accessToken, externalId }: PostRef): Promise<AnalyticsSnapshotData> {
    const res = await this.fetchFn(
      `${TWEETS_URL}/${externalId}?tweet.fields=public_metrics`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new ExternalServiceError(`X metrics lookup failed (${res.status})`);
    const body = (await res.json()) as {
      data?: {
        public_metrics?: {
          impression_count?: number;
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          quote_count?: number;
        };
      };
    };
    const m = body.data?.public_metrics;
    if (!m) throw new ExternalServiceError("X returned no metrics for the tweet");
    return {
      impressions: m.impression_count ?? 0,
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      // X splits resharing into retweets + quotes; sum them for the shares metric.
      shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      capturedAt: new Date(this.now()),
    };
  }
}
