// Publisher contract — one thin adapter per platform on each platform's
// own official API (replaces a paid aggregator like Ayrshare).
// See docs/02-architecture.md §6 and docs/04-integrations.md §2.
//
// Phase 0: interface only. Adapters are stubbed — no logic yet.

export type Platform =
  | "linkedin"
  | "meta_ig"
  | "meta_fb"
  | "youtube"
  | "tiktok"
  | "pinterest"
  | "x"; // x = paid API, deferred (not in MVP)

export interface ConnectInput {
  clientId: string;
  /** OAuth authorization code returned from the platform consent screen. */
  authCode: string;
  redirectUri: string;
}

export interface ConnectedAccountRef {
  id: string;
  platform: Platform;
  handle?: string;
}

export interface MediaRef {
  kind: "image" | "video";
  url: string;
}

export interface PublishInput {
  /** Must reference an item whose status === "approved". */
  contentItemId: string;
  account: ConnectedAccountRef;
  caption: string;
  media: MediaRef[];
  scheduledAt?: Date;
}

export interface PublishResult {
  externalId: string;
  permalink?: string;
}

export interface PostRef {
  account: ConnectedAccountRef;
  externalId: string;
}

export interface AnalyticsSnapshotData {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  watchTimeSeconds?: number;
  capturedAt: Date;
}

/** Implemented once per platform. Adding a platform = one new adapter. */
export interface Publisher {
  readonly platform: Platform;
  connect(input: ConnectInput): Promise<ConnectedAccountRef>;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics(ref: PostRef): Promise<AnalyticsSnapshotData>;
}
