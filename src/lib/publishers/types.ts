// Publisher contract — one thin adapter per platform on each platform's own
// official API (replaces a paid aggregator). connect/exchange returns the tokens
// for the app to encrypt + store; publish posts an approved item. Adding a
// platform = one adapter. X is paid → deferred.
export type Platform =
  | "linkedin"
  | "meta_ig"
  | "meta_fb"
  | "youtube"
  | "tiktok"
  | "pinterest"
  | "x";

export interface AuthorizeUrlParams {
  redirectUri: string;
  /** Opaque, signed state for CSRF protection on the callback. */
  state: string;
}

/** Result of exchanging an OAuth code — the app encrypts the tokens before store. */
export interface ConnectionResult {
  externalId: string; // platform account id / author urn
  handle?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface PublishInput {
  accessToken: string;
  authorId: string; // the connected account's externalId
  caption: string;
  mediaUrls?: string[];
}

export interface PublishResult {
  externalId: string;
  permalink?: string;
}

export interface PostRef {
  accessToken: string;
  externalId: string;
}

export interface AnalyticsSnapshotData {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  capturedAt: Date;
}

export interface Publisher {
  readonly platform: Platform;
  authorizeUrl(params: AuthorizeUrlParams): string;
  exchangeCode(authCode: string, redirectUri: string): Promise<ConnectionResult>;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics(ref: PostRef): Promise<AnalyticsSnapshotData>;
}
