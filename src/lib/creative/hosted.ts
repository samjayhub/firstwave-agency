// Hosted image provider. A thin adapter over a hosted image-gen API; the exact
// request/response shape varies per vendor, so the endpoint + fetch are
// injectable and this is a template to tune per provider. The fake provider is
// the default until a key is configured.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { CreativeProvider, ImageRequest, ImageResult } from "./types";
import { buildImagePrompt, chooseImageModel } from "./prompt";

type FetchFn = typeof fetch;

const DEFAULT_ENDPOINTS: Record<"imagen" | "ideogram", string> = {
  imagen: "https://generativelanguage.googleapis.com/v1/images:generate",
  ideogram: "https://api.ideogram.ai/v1/images",
};

export class HostedImageProvider implements CreativeProvider {
  constructor(
    private readonly apiKey: string,
    private readonly provider: "imagen" | "ideogram",
    private readonly opts: { fetchFn?: FetchFn; endpoint?: string; timeoutMs?: number } = {},
  ) {}

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const model = chooseImageModel(this.provider, req.needsLegibleText);
    const fetchFn = this.opts.fetchFn ?? fetch;
    const endpoint = this.opts.endpoint ?? DEFAULT_ENDPOINTS[this.provider];

    let res: Response;
    try {
      res = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: buildImagePrompt(req),
          width: req.width ?? 1024,
          height: req.height ?? 1024,
        }),
        // Below the route's maxDuration (60s) so a mapped error wins the race.
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 55_000),
      });
    } catch (err) {
      throw new ExternalServiceError("Image generation request failed", { cause: err });
    }

    if (!res.ok) {
      throw new ExternalServiceError(`Image generation failed with status ${res.status}`);
    }

    const data = (await res.json()) as { b64_json?: string; image?: string };
    const b64 = data.b64_json ?? data.image;
    if (!b64) throw new ExternalServiceError("Image generation returned no image data");

    return { bytes: Buffer.from(b64, "base64"), contentType: "image/png", model };
  }
}
