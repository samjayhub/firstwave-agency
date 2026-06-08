// Meta publisher adapter — talks straight to the Facebook Graph API (no
// aggregator) for both Facebook Pages (meta_fb) and Instagram Business
// (meta_ig). One class, parameterised by the target platform, since both share
// OAuth, the Graph host, and metrics; only publish() and scopes diverge.
//
// Publishing model:
//  - meta_fb: POST /{page-id}/feed (text) or /{page-id}/photos (image).
//  - meta_ig: two-step container create + media_publish; media is REQUIRED.
// The stored access token is the long-lived PAGE token (IG publishes through it).
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

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

export type MetaPlatform = "meta_fb" | "meta_ig";

const SCOPES: Record<MetaPlatform, string> = {
  meta_fb: "pages_manage_posts,pages_read_engagement,pages_show_list,public_profile",
  meta_ig:
    "instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list",
};

export interface MetaConfig {
  platform: MetaPlatform;
  appId: string;
  appSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}
interface PageAccount {
  id?: string;
  name?: string;
  access_token?: string;
}

export class MetaPublisher implements Publisher {
  readonly platform: Platform;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: MetaConfig) {
    this.platform = config.platform;
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  private async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ExternalServiceError(`Meta Graph error (${res.status})`);
    }
    return (await res.json()) as T;
  }

  authorizeUrl({ redirectUri, state }: AuthorizeUrlParams): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      state,
      scope: SCOPES[this.config.platform as MetaPlatform],
    });
    return `${DIALOG_URL}?${params.toString()}`;
  }

  async exchangeCode(authCode: string, redirectUri: string): Promise<ConnectionResult> {
    const tokenUrl = `${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: redirectUri,
      code: authCode,
    }).toString()}`;
    const token = await this.getJson<TokenResponse>(tokenUrl);
    if (!token.access_token) throw new ExternalServiceError("Meta returned no access token");

    // Resolve the managed Page (and its long-lived page token).
    const pages = await this.getJson<{ data?: PageAccount[] }>(
      `${GRAPH}/me/accounts?${new URLSearchParams({ access_token: token.access_token }).toString()}`,
    );
    const page = pages.data?.[0];
    if (!page?.id || !page.access_token) {
      throw new ExternalServiceError("No Facebook Page is available on this account");
    }

    const expiresAt = token.expires_in
      ? new Date(this.now() + token.expires_in * 1000)
      : undefined;

    if (this.config.platform === "meta_fb") {
      return {
        externalId: page.id,
        ...(page.name ? { handle: page.name } : {}),
        accessToken: page.access_token,
        ...(expiresAt ? { expiresAt } : {}),
      };
    }

    // Instagram: the Page must have a linked IG Business account.
    const ig = await this.getJson<{
      instagram_business_account?: { id?: string; username?: string };
    }>(
      `${GRAPH}/${page.id}?${new URLSearchParams({
        fields: "instagram_business_account{id,username}",
        access_token: page.access_token,
      }).toString()}`,
    );
    const igAccount = ig.instagram_business_account;
    if (!igAccount?.id) {
      throw new ExternalServiceError("No Instagram Business account linked to this Page");
    }
    return {
      externalId: igAccount.id,
      ...(igAccount.username ? { handle: igAccount.username } : {}),
      accessToken: page.access_token,
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    return this.config.platform === "meta_ig"
      ? this.publishInstagram(input)
      : this.publishFacebook(input);
  }

  private async publishFacebook({
    accessToken,
    authorId,
    caption,
    mediaUrls,
  }: PublishInput): Promise<PublishResult> {
    const hasMedia = mediaUrls && mediaUrls.length > 0;
    const endpoint = hasMedia ? "photos" : "feed";
    const body = new URLSearchParams({ access_token: accessToken });
    if (hasMedia) {
      body.set("url", mediaUrls![0]!);
      body.set("caption", caption);
    } else {
      body.set("message", caption);
    }
    const out = await this.getJson<{ id?: string; post_id?: string }>(
      `${GRAPH}/${authorId}/${endpoint}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );
    const id = out.post_id ?? out.id;
    if (!id) throw new ExternalServiceError("Facebook publish returned no post id");
    return { externalId: id, permalink: `https://www.facebook.com/${id}` };
  }

  private async publishInstagram({
    accessToken,
    authorId,
    caption,
    mediaUrls,
  }: PublishInput): Promise<PublishResult> {
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new ValidationError("Instagram posts require an image — no media provided");
    }
    // Step 1: create a media container.
    const container = await this.getJson<{ id?: string }>(`${GRAPH}/${authorId}/media`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: mediaUrls[0]!,
        caption,
        access_token: accessToken,
      }).toString(),
    });
    if (!container.id) throw new ExternalServiceError("Instagram media container failed");

    // Step 2: publish the container.
    const published = await this.getJson<{ id?: string }>(
      `${GRAPH}/${authorId}/media_publish`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: container.id,
          access_token: accessToken,
        }).toString(),
      },
    );
    if (!published.id) throw new ExternalServiceError("Instagram media_publish returned no id");
    return { externalId: published.id, permalink: `https://www.instagram.com/p/${published.id}` };
  }

  async fetchMetrics({ accessToken, externalId }: PostRef): Promise<AnalyticsSnapshotData> {
    const metric =
      this.config.platform === "meta_ig"
        ? "impressions,likes,comments,shares"
        : "post_impressions,post_reactions_by_type_total,post_clicks";
    const data = await this.getJson<{
      data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
    }>(
      `${GRAPH}/${externalId}/insights?${new URLSearchParams({
        metric,
        access_token: accessToken,
      }).toString()}`,
    );

    const byName = new Map<string, number>();
    for (const row of data.data ?? []) {
      const v = row.values?.[0]?.value;
      byName.set(row.name ?? "", typeof v === "number" ? v : 0);
    }
    return {
      impressions: byName.get("impressions") ?? byName.get("post_impressions") ?? 0,
      likes: byName.get("likes") ?? byName.get("post_reactions_by_type_total") ?? 0,
      comments: byName.get("comments") ?? 0,
      shares: byName.get("shares") ?? 0,
      capturedAt: new Date(this.now()),
    };
  }
}
