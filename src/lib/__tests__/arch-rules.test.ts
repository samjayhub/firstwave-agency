import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Guard test: enforces the hard architectural rules by scanning source. Cheaper
// and more reliable than a custom lint plugin for the handful of bans we care
// about. An escape hatch comment `arch-allow: <reason>` on the same line opts a
// deliberate exception out.
const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url)); // -> /src
const SELF = fileURLToPath(import.meta.url);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Exclude this guard file itself: it necessarily contains the banned tokens it
// searches for (in regexes and test names).
const files = walk(SRC_DIR).filter((f) => f !== SELF);

function offenders(pattern: RegExp, opts: { skipTests?: boolean } = {}): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (opts.skipTests && /\.test\.tsx?$/.test(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (pattern.test(line) && !line.includes("arch-allow")) {
        hits.push(`${file}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  return hits;
}

describe("architectural rules", () => {
  it("has source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no @ts-ignore (use a typed fix instead)", () => {
    expect(offenders(/@ts-ignore/)).toEqual([]);
  });

  it("uses no setTimeout/setInterval for business logic (use BullMQ)", () => {
    expect(offenders(/\b(setTimeout|setInterval)\s*\(/, { skipTests: true })).toEqual([]);
  });

  it("hardcodes no obvious secrets", () => {
    // Flags string-assigned values that look like real keys, not env reads.
    expect(
      offenders(/(secret|api[_-]?key|password)\s*[:=]\s*["'][A-Za-z0-9/+]{16,}["']/i, {
        skipTests: true,
      }),
    ).toEqual([]);
  });
});
