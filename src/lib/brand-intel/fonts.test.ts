import { describe, it, expect } from "vitest";
import { extractFontFamilies, fontsFromCss } from "./fonts";

describe("extractFontFamilies", () => {
  it("prioritizes @font-face families and drops generics/duplicates", () => {
    const css = `
      @font-face { font-family: "Inter"; src: url(inter.woff2); }
      h1 { font-family: "Inter", Arial, sans-serif; }
      body { font-family: Georgia, serif; }
      p { font-family: georgia, serif; }
    `;
    expect(extractFontFamilies(css)).toEqual(["Inter", "Arial", "Georgia"]);
  });
});

describe("fontsFromCss", () => {
  it("assigns heading to the first family and body to the second", () => {
    const fonts = fontsFromCss(
      '@font-face{font-family:"Poppins"} h1{font-family:Poppins} p{font-family:"Open Sans"}',
    );
    expect(fonts[0]).toEqual({ family: "Poppins", role: "heading" });
    expect(fonts[1]).toEqual({ family: "Open Sans", role: "body" });
  });
});
