import { describe, it, expect } from "vitest";
import { buildImagePrompt, chooseImageModel } from "./prompt";

describe("buildImagePrompt", () => {
  it("injects palette, fonts, and the legible-text instruction", () => {
    const prompt = buildImagePrompt({
      prompt: "A gym at sunrise",
      style: { palette: ["#0a1f44", "#f59e0b"], fonts: ["Poppins"] },
      needsLegibleText: true,
    });
    expect(prompt).toContain("A gym at sunrise");
    expect(prompt).toContain("#0a1f44");
    expect(prompt).toContain("Poppins");
    expect(prompt).toMatch(/legible/i);
  });

  it("omits style sentences when there is no palette/fonts", () => {
    const prompt = buildImagePrompt({ prompt: "Plain", style: { palette: [], fonts: [] } });
    expect(prompt).not.toMatch(/palette/i);
    expect(prompt).not.toMatch(/Typography/i);
  });
});

describe("chooseImageModel", () => {
  it("routes legible-text requests to a text-strong model", () => {
    expect(chooseImageModel("imagen", true)).toBe("ideogram-v3");
  });
  it("uses the cheap draft model for plain imagery", () => {
    expect(chooseImageModel("imagen", false)).toBe("imagen-4-fast");
    expect(chooseImageModel("ideogram", false)).toBe("ideogram-v3");
    expect(chooseImageModel("fake", false)).toBe("fake-image-1");
  });
});
