// Pinterest publisher adapter — OAuth 2.0 + the Pinterest API v5. Pins are
// image-first and must live on a board, so publish() requires a media URL and
// targets the account's first board (the contract carries no board id). Metrics
// come from a pin's analytics over a trailing window. The fetch is injectable.
//
// Pinterest's metric vocabulary doesn't map 1:1 to the generic snapshot — we map
// IMPRESSION→impressions, SAVE→shares (a save is Pinterest's reshare), and
// PIN_CLICK→likes (closest engagement signal); comments aren't exposed here.
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

const AUTH_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const ME_URL = "https://api.pinterest.com/v5/user_account";
const BOARDS_URL = "https://api.pinterest.com/v5/boards";
const PINS_URL = "https://api.pinterest.com/v5/pins";
const SCOPE = "user_accounts:read,pins:read,pins:write,boards:read";
const MAX_TITLE = 100;
const ANALYTICS_WINDOW_DAYS = 30;

export interface PinterestConfig {
  appId: string;
  appSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export class PinterestPublisher implements Publisher {
  readonly platform: Platform = "pinterest";
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: PinterestConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  /** HTTP Basic credential for the token endpoint. */
  private basicAuth(): string {
    return Buffer.from(`${this.config.appId}:${this.config.appSecret}`).toString("base64");
  }

  private day(offsetMs: number): string {
    return new Date(this.now() - offsetMs).toISOString().slice(0, 10);
  }

  authorizeUrl({ redirectUri, state }: AuthorizeUrlParams): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      scope: SCOPE,
      state,
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
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new ExternalServiceError(`Pinterest token exchange failed (${tokenRes.status})`);
    }
    const token = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) throw new ExternalServiceError("Pinterest returned no access token");

    const meRes = await this.fetchFn(ME_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new ExternalServiceError(`Pinterest profile lookup failed (${meRes.status})`);
    const me = (await meRes.json()) as { username?: string };
    if (!me.username) throw new ExternalServiceError("Pinterest profile had no username");

    return {
      externalId: me.username,
      handle: me.username,
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in
        ? { expiresAt: new Date(this.now() + token.expires_in * 1000) }
        : {}),
    };
  }

  async publish({ accessToken, caption, mediaUrls }: PublishInput): Promise<PublishResult> {
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new ValidationError("Pinterest requires an image — no media provided");
    }
    // A pin must live on a board; the contract carries no board id, so use the
    // account's first board (the common single-board case).
    const boardsRes = await this.fetchFn(`${BOARDS_URL}?page_size=1`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!boardsRes.ok) throw new ExternalServiceError(`Pinterest board lookup failed (${boardsRes.status})`);
    const boards = (await boardsRes.json()) as { items?: Array<{ id?: string }> };
    const boardId = boards.items?.[0]?.id;
    if (!boardId) throw new ExternalServiceError("Pinterest account has no board to pin to");

    const res = await this.fetchFn(PINS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        board_id: boardId,
        title: caption.slice(0, MAX_TITLE),
        description: caption,
        media_source: { source_type: "image_url", url: mediaUrls[0] },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new ExternalServiceError(`Pinterest publish failed (${res.status})`);
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new ExternalServiceError("Pinterest publish returned no pin id");
    return { externalId: body.id, permalink: `https://www.pinterest.com/pin/${body.id}/` };
  }

  async fetchMetrics({ accessToken, externalId }: PostRef): Promise<AnalyticsSnapshotData> {
    const params = new URLSearchParams({
      start_date: this.day(ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      end_date: this.day(0),
      metric_types: "IMPRESSION,SAVE,PIN_CLICK",
    });
    const res = await this.fetchFn(`${PINS_URL}/${externalId}/analytics?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new ExternalServiceError(`Pinterest metrics lookup failed (${res.status})`);
    const body = (await res.json()) as {
      all?: { summary_metrics?: Record<string, number> };
      summary_metrics?: Record<string, number>;
    };
    const m = body.all?.summary_metrics ?? body.summary_metrics;
    if (!m) throw new ExternalServiceError("Pinterest returned no metrics for the pin");
    return {
      impressions: m.IMPRESSION ?? 0,
      likes: m.PIN_CLICK ?? 0,
      shares: m.SAVE ?? 0,
      capturedAt: new Date(this.now()),
    };
  }
}
