// Typography extraction from CSS — pure. Reads @font-face families and
// font-family declarations, drops generic keywords, ranks by usage, and assigns
// heading/body roles (first/most-prominent custom face = heading).
import type { BrandFont } from "./types";

const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "inherit",
  "initial",
  "unset",
  "-apple-system",
  "blinkmacsystemfont",
]);

const FONT_FACE_RE = /@font-face\s*\{[^}]*font-family\s*:\s*([^;]+);/gi;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}]+)[;}]/gi;

function cleanFamily(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}

/** Ordered, de-duplicated list of non-generic font families used in the CSS. */
export function extractFontFamilies(css: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const consider = (value: string) => {
    for (const part of value.split(",")) {
      const family = cleanFamily(part);
      const key = family.toLowerCase();
      if (!family || GENERIC.has(key) || seen.has(key)) continue;
      seen.add(key);
      ordered.push(family);
    }
  };

  // @font-face families first — these are the brand's own fonts.
  for (const m of css.matchAll(FONT_FACE_RE)) consider(m[1]!);
  for (const m of css.matchAll(FONT_FAMILY_RE)) consider(m[1]!);

  return ordered;
}

export function classifyFonts(families: string[]): BrandFont[] {
  return families.slice(0, 4).map((family, i) => ({
    family,
    role: i === 0 ? "heading" : i === 1 ? "body" : "other",
  }));
}

export function fontsFromCss(css: string): BrandFont[] {
  return classifyFonts(extractFontFamilies(css));
}
