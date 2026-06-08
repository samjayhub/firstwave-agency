// Palette extraction from CSS — pure, deterministic, in-house (replaces a paid
// brand-kit API). Pulls color tokens from stylesheet text, ranks by frequency,
// and assigns brand roles using HSL heuristics.
import type { PaletteColor } from "./types";

export interface RankedColor {
  hex: string;
  count: number;
}

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, n));
}

export function normalizeHex(raw: string): string | null {
  const m = raw.replace("#", "");
  if (!/^[0-9a-fA-F]+$/.test(m)) return null;
  if (m.length === 3) {
    return ("#" + m.split("").map((c) => c + c).join("")).toLowerCase();
  }
  if (m.length === 6) return ("#" + m).toLowerCase();
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** All color tokens found in CSS text, normalized to #rrggbb, in document order. */
export function extractColorTokens(css: string): string[] {
  const out: string[] = [];
  for (const match of css.matchAll(HEX_RE)) {
    const hex = normalizeHex(match[0]);
    if (hex) out.push(hex);
  }
  for (const match of css.matchAll(RGB_RE)) {
    out.push(rgbToHex(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  return out;
}

/** Unique colors ranked by frequency (desc), ties broken by first appearance. */
export function rankColors(tokens: string[]): RankedColor[] {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}

/**
 * Assign brand roles to ranked colors. Deterministic heuristics:
 *  - background = lightest color, text = darkest color
 *  - primary = most frequent reasonably-saturated color
 *  - secondary = next such color; accent = most saturated remaining
 */
export function classifyPalette(ranked: RankedColor[]): PaletteColor[] {
  if (ranked.length === 0) return [];
  const withHsl = ranked.map((c) => ({ ...c, hsl: hexToHsl(c.hex) }));

  const byLight = [...withHsl].sort((a, b) => a.hsl.l - b.hsl.l);
  const background = byLight[byLight.length - 1]!;
  const text = byLight[0]!;

  const used = new Set<string>([background.hex, text.hex]);
  const vivid = withHsl
    .filter((c) => !used.has(c.hex) && c.hsl.s >= 0.2 && c.hsl.l > 0.15 && c.hsl.l < 0.85)
    .sort((a, b) => b.count - a.count);

  const primary = vivid[0];
  const secondary = vivid[1];
  const accent = [...withHsl]
    .filter((c) => !used.has(c.hex) && c.hex !== primary?.hex && c.hex !== secondary?.hex)
    .sort((a, b) => b.hsl.s - a.hsl.s)[0];

  const palette: PaletteColor[] = [];
  const push = (hex: string | undefined, role: PaletteColor["role"]) => {
    if (hex && !palette.some((p) => p.hex === hex)) palette.push({ hex, role });
  };
  push(primary?.hex, "primary");
  push(secondary?.hex, "secondary");
  push(accent?.hex, "accent");
  push(background.hex, "background");
  push(text.hex, "text");
  return palette;
}

export function paletteFromCss(css: string): PaletteColor[] {
  return classifyPalette(rankColors(extractColorTokens(css)));
}
