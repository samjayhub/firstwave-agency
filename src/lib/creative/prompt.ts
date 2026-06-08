// Pure helpers: build the image prompt with brand style injected, and pick the
// model. Models that render in-image text well (Ideogram / Nano Banana) are used
// when the request needs legible text (flyers); otherwise the cheap draft model.
import type { ImageRequest } from "./types";

export type ImageGenProvider = "imagen" | "ideogram" | "fake";

export function buildImagePrompt(req: ImageRequest): string {
  const parts: string[] = [req.prompt.trim()];
  if (req.style.palette.length > 0) {
    parts.push(`Use the brand color palette: ${req.style.palette.join(", ")}.`);
  }
  if (req.style.fonts.length > 0) {
    parts.push(`Typography in the style of: ${req.style.fonts.join(", ")}.`);
  }
  if (req.needsLegibleText) {
    parts.push("Any in-image text must be crisp, correctly spelled, and legible.");
  }
  parts.push("A high-quality, on-brand social media visual.");
  return parts.join(" ");
}

export function chooseImageModel(
  provider: ImageGenProvider,
  needsLegibleText: boolean | undefined,
): string {
  if (provider === "fake") return "fake-image-1";
  // Text-heavy creative → text-strong model regardless of the default provider.
  if (needsLegibleText) return "ideogram-v3";
  return provider === "ideogram" ? "ideogram-v3" : "imagen-4-fast";
}
