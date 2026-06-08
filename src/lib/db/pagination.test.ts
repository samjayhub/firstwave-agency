import { describe, it, expect } from "vitest";
import {
  buildCursorArgs,
  clampLimit,
  toCursorPage,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./pagination";

describe("clampLimit", () => {
  it("defaults and clamps to the max", () => {
    expect(clampLimit()).toBe(DEFAULT_PAGE_SIZE);
    expect(clampLimit(5)).toBe(5);
    expect(clampLimit(9999)).toBe(MAX_PAGE_SIZE);
  });

  it("rejects non-positive / non-integer limits", () => {
    expect(() => clampLimit(0)).toThrow();
    expect(() => clampLimit(-1)).toThrow();
    expect(() => clampLimit(2.5)).toThrow();
  });
});

describe("buildCursorArgs", () => {
  it("over-fetches by one and orders stably, with no offset on page 1", () => {
    const args = buildCursorArgs({ agencyId: "ag1" }, { limit: 10 });
    expect(args.take).toBe(11);
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
    expect(args.where).toEqual({ agencyId: "ag1" });
  });

  it("uses cursor + skip:1 (step past the cursor row, never an offset)", () => {
    const args = buildCursorArgs({ agencyId: "ag1" }, { cursor: "client_5", limit: 10 });
    expect(args.cursor).toEqual({ id: "client_5" });
    expect(args.skip).toBe(1);
  });
});

describe("toCursorPage", () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id_${i}` }));

  it("reports hasMore + nextCursor when over-fetched", () => {
    const page = toCursorPage(make(11), { limit: 10 });
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("id_9");
  });

  it("is the last page when not over-fetched", () => {
    const page = toCursorPage(make(3), { limit: 10 });
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
