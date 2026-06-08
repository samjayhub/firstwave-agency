// Creative Studio provider interface. Abstracts image generation so hosted APIs
// ↔ self-hosted open models is a config swap (docs/02 §5, §7). The provider
// returns raw bytes; the studio stores them via an AssetStorage and records an
// Asset row. Video deferred to Phase 3.

export interface BrandStyle {
  palette: string[]; // hex
  fonts: string[];
}

export interface ImageRequest {
  prompt: string;
  style: BrandStyle;
  /** True for flyers with in-image text → route to a text-strong model. */
  needsLegibleText?: boolean;
  width?: number;
  height?: number;
}

export interface ImageResult {
  bytes: Buffer;
  contentType: string;
  model: string;
}

export interface CreativeProvider {
  generateImage(req: ImageRequest): Promise<ImageResult>;
}

// ── Object storage abstraction (local fs for MVP → S3/R2 later) ──
export interface StoredObject {
  /** Where the object can be fetched from (path or public URL). */
  url: string;
  key: string;
}

export interface StoredBytes {
  bytes: Buffer;
  contentType: string;
}

export interface AssetStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject>;
  /** Fetch a stored object's bytes (for the tenant-checked streamer). */
  get(key: string): Promise<StoredBytes | null>;
}
