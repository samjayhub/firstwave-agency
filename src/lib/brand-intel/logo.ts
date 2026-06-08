// Logo heuristic — pure. Given image candidates (with optional alt/class/id
// context), pick the most logo-like one. Falls back to the first header image.
export interface ImageCandidate {
  src: string;
  alt?: string;
  className?: string;
  id?: string;
  inHeader?: boolean;
}

function score(img: ImageCandidate): number {
  const hay = `${img.src} ${img.alt ?? ""} ${img.className ?? ""} ${img.id ?? ""}`.toLowerCase();
  let s = 0;
  if (/\blogo\b/.test(hay)) s += 10;
  if (hay.includes("logo")) s += 5;
  if (hay.includes("brand")) s += 3;
  if (img.inHeader) s += 4;
  if (/\.svg(\?|$)/.test(img.src.toLowerCase())) s += 2; // logos are often SVG
  if (hay.includes("icon")) s -= 1;
  if (hay.includes("sprite")) s -= 3;
  return s;
}

/** Best logo URL, or undefined if there are no usable candidates. */
export function pickLogo(images: ImageCandidate[]): string | undefined {
  const usable = images.filter((i) => i.src && !i.src.startsWith("data:"));
  if (usable.length === 0) return undefined;

  const ranked = usable
    .map((img, index) => ({ img, index, s: score(img) }))
    .sort((a, b) => b.s - a.s || a.index - b.index);

  const best = ranked[0]!;
  // If nothing scored as logo-like, fall back to the first in-header image, else
  // the first image overall.
  if (best.s <= 0) {
    return usable.find((i) => i.inHeader)?.src ?? usable[0]!.src;
  }
  return best.img.src;
}
