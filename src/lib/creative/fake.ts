// Deterministic CreativeProvider for tests / no-key dev. Returns a tiny valid
// 1x1 PNG so the rest of the pipeline (storage, Asset row) exercises real bytes.
import type { CreativeProvider, ImageRequest, ImageResult } from "./types";
import { chooseImageModel } from "./prompt";

// 1x1 transparent PNG.
const ONE_PX_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export class FakeCreativeProvider implements CreativeProvider {
  readonly calls: ImageRequest[] = [];

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    this.calls.push(req);
    return {
      bytes: Buffer.from(ONE_PX_PNG_BASE64, "base64"),
      contentType: "image/png",
      model: chooseImageModel("fake", req.needsLegibleText),
    };
  }
}
