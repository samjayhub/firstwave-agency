// Self-hosted image provider (P3-07). Talks to an open image-gen model running on
// our own GPU box over HTTP — the same CreativeProvider contract as the hosted
// adapter, so switching is purely a config swap (IMAGE_GEN_PROVIDER=selfhosted),
// per the design note in ./types. No metered per-call cost; auth is an optional
// bearer token for the internal endpoint. Accepts either base64 or a URL the
// server returns (which we then fetch). Endpoint + fetch are injectable.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { CreativeProvider, ImageRequest, ImageResult } from "./types";
import { buildImagePrompt } from "./prompt";

type FetchFn = typeof fetch;

export interface SelfHostedImageConfig {
  endpoint: string;
  model?: string;
  /** Optional bearer for the internal endpoint (omit on a trusted network). */
  token?: string;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

/** Common response shapes from OpenAI-compatible / A1111-style image servers. */
interface ImageServerResponse {
  b64_json?: string;
  image?: string;
  url?: string;
  images?: Array<{ b64_json?: string; url?: string } | string>;
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class SelfHostedImageProvider implements CreativeProvider {
  private readonly model: string;
  private readonly fetchFn: FetchFn;

  constructor(private readonly config: SelfHostedImageConfig) {
    this.model = config.model ?? "sdxl";
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;

    let res: Response;
    try {
      res = await this.fetchFn(this.config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          prompt: buildImagePrompt(req),
          width: req.width ?? 1024,
          height: req.height ?? 1024,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 55_000),
      });
    } catch (err) {
      throw new ExternalServiceError("Self-hosted image request failed", { cause: err });
    }
    if (!res.ok) {
      throw new ExternalServiceError(`Self-hosted image generation failed (${res.status})`);
    }

    const data = (await res.json()) as ImageServerResponse;
    const first = data.images?.[0] ?? data.data?.[0];
    const firstObj = typeof first === "string" ? { b64_json: first } : first;
    const b64 = data.b64_json ?? data.image ?? firstObj?.b64_json;
    if (b64) {
      return { bytes: Buffer.from(b64, "base64"), contentType: "image/png", model: this.model };
    }

    // No inline bytes — the server returned a URL; fetch the image bytes.
    const url = data.url ?? firstObj?.url;
    if (!url) throw new ExternalServiceError("Self-hosted image returned no image data");
    const imgRes = await this.fetchFn(url, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) throw new ExternalServiceError(`Self-hosted image fetch failed (${imgRes.status})`);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    if (bytes.length === 0) throw new ExternalServiceError("Self-hosted image URL had no bytes");
    return {
      bytes,
      contentType: imgRes.headers.get("content-type") ?? "image/png",
      model: this.model,
    };
  }
}
