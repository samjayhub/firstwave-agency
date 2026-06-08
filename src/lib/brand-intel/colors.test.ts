import { describe, it, expect } from "vitest";
import {
  extractColorTokens,
  rankColors,
  normalizeHex,
  hexToHsl,
  paletteFromCss,
} from "./colors";

describe("normalizeHex", () => {
  it("expands 3-digit and lowercases 6-digit hex", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#1A2B3C")).toBe("#1a2b3c");
    expect(normalizeHex("#xyz")).toBeNull();
  });
});

describe("extractColorTokens", () => {
  it("extracts hex and rgb() colors normalized to hex", () => {
    const css = "a{color:#FFF}b{color:#1a2b3c}c{background:rgb(255, 0, 0)}";
    expect(extractColorTokens(css)).toEqual(["#ffffff", "#1a2b3c", "#ff0000"]);
  });
});

describe("rankColors", () => {
  it("ranks by frequency descending", () => {
    const ranked = rankColors(["#000000", "#ffffff", "#000000", "#000000"]);
    expect(ranked[0]).toEqual({ hex: "#000000", count: 3 });
    expect(ranked[1]).toEqual({ hex: "#ffffff", count: 1 });
  });
});

describe("hexToHsl", () => {
  it("computes lightness extremes", () => {
    expect(hexToHsl("#000000").l).toBe(0);
    expect(hexToHsl("#ffffff").l).toBe(1);
    expect(hexToHsl("#ff0000").h).toBeCloseTo(0, 0);
  });
});

describe("paletteFromCss", () => {
  it("assigns background to the lightest and text to the darkest color", () => {
    const css = `
      body { background: #ffffff; color: #111111; }
      .brand { color: #2563eb; }
      .brand { color: #2563eb; }
      .cta { background: #f59e0b; }
    `;
    const palette = paletteFromCss(css);
    const byRole = Object.fromEntries(palette.map((p) => [p.role, p.hex]));
    expect(byRole.background).toBe("#ffffff");
    expect(byRole.text).toBe("#111111");
    expect(byRole.primary).toBe("#2563eb"); // most frequent saturated color
    expect(palette.every((p) => /^#[0-9a-f]{6}$/.test(p.hex))).toBe(true);
  });

  it("returns an empty palette for color-less CSS", () => {
    expect(paletteFromCss("body { margin: 0 }")).toEqual([]);
  });
});
