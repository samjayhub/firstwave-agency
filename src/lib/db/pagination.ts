// Cursor-based pagination. Offset pagination (skip: N) is BANNED — it is O(N) on
// the DB and skips/duplicates rows under concurrent writes. Every list endpoint
// uses an opaque cursor (the last row's id) plus a stable ordering.

import { ValidationError } from "@/lib/errors/app-error";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface CursorPageParams {
  /** Opaque cursor = id of the last item from the previous page. */
  cursor?: string;
  /** Page size; clamped to [1, MAX_PAGE_SIZE]. */
  limit?: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function clampLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError("limit must be a positive integer");
  }
  return Math.min(limit, MAX_PAGE_SIZE);
}

/**
 * Build Prisma findMany args for a cursor page. Fetches one extra row to detect
 * `hasMore`. Stable ordering by (createdAt desc, id desc) so the cursor is total.
 * The only `skip` used is `1` to step past the cursor row itself — never an
 * offset.
 */
export function buildCursorArgs<W extends object>(
  where: W,
  params: CursorPageParams,
): {
  where: W;
  take: number;
  orderBy: Array<{ createdAt: "desc" } | { id: "desc" }>;
  cursor?: { id: string };
  skip?: number;
} {
  const limit = clampLimit(params.limit);
  return {
    where,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  };
}

/** Slice the over-fetched rows into a page + nextCursor. */
export function toCursorPage<T extends { id: string }>(
  rows: T[],
  params: CursorPageParams,
): CursorPage<T> {
  const limit = clampLimit(params.limit);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;
  return { items, nextCursor, hasMore };
}
