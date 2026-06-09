import type { ItemStatus } from "@/lib/approval/state-machine";

/** A shareable reviewer link for a client's approval queue. */
export interface ReviewShareRecord {
  id: string;
  clientId: string;
  token: string;
  revoked: boolean;
  createdAt: Date;
}

/** One reviewer note on a content item (threaded by createdAt). */
export interface ReviewComment {
  id: string;
  body: string;
  author: string;
  createdAt: Date;
}

/** An item as the reviewer sees it: status, schedule, copy preview + comments. */
export interface ReviewQueueItem {
  id: string;
  status: ItemStatus;
  scheduledAt: Date | null;
  copy: unknown;
  comments: ReviewComment[];
}

/** What a valid token resolves to. */
export interface ResolvedShare {
  clientId: string;
  agencyId: string;
  clientName: string;
}

/**
 * Persistence for the reviewer portal. Share management is agency-scoped (admin
 * side); the reviewer side is scoped by the clientId a token resolves to, so a
 * token can only ever touch its own client's queue. Implementations: fake, Prisma.
 */
export interface ReviewStore {
  // ── Admin side (agency-scoped through the client) ──────────────
  /** Create a share for a client the agency owns; null if it doesn't own it. */
  createShare(
    agencyId: string,
    clientId: string,
    token: string,
  ): Promise<ReviewShareRecord | null>;
  listShares(agencyId: string, clientId: string): Promise<ReviewShareRecord[]>;
  /** Revoke a share the agency owns. False if not found / wrong tenant. */
  revokeShare(agencyId: string, shareId: string): Promise<boolean>;

  // ── Reviewer side (token-resolved) ─────────────────────────────
  /** Resolve a non-revoked token to its client + agency, or null. */
  resolveShare(token: string): Promise<ResolvedShare | null>;
  queueForClient(clientId: string): Promise<ReviewQueueItem[]>;
  getItem(clientId: string, itemId: string): Promise<ReviewQueueItem | null>;
  /** Conditional status flip scoped to the client. False if it already moved. */
  transition(
    clientId: string,
    itemId: string,
    from: ItemStatus,
    to: ItemStatus,
  ): Promise<boolean>;
  /** Append a comment to an item on this client; null if the item isn't here. */
  addComment(
    clientId: string,
    itemId: string,
    body: string,
    author: string,
  ): Promise<ReviewComment | null>;
}
