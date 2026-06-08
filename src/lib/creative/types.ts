// Creative Studio provider interface. Abstracts image/video generation so
// hosted APIs ↔ self-hosted open models is a config swap (docs/02 §5, §7).
// Phase 0: types only. Video deferred to Phase 3.

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

export interface GeneratedMedia {
  url: string; // object storage
  model: string;
  kind: "image" | "video";
}

export interface CreativeProvider {
  generateImage(req: ImageRequest): Promise<GeneratedMedia>;
  // generateVideo(req: VideoRequest): Promise<GeneratedMedia>;  // Phase 3
}
