// Pure view-model helpers for the operator dashboard (P4-03). All presentation
// logic that is worth testing lives here as deterministic functions, so the
// React components stay thin and the behaviour is covered without a browser.
// No I/O, no React — safe to import from server components and unit tests alike.
import type { ItemStatus } from "@/lib/approval/state-machine";

export const ITEM_STATUSES: ItemStatus[] = [
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "failed",
];

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

/** Human label + colour tone for each pipeline status. */
export const STATUS_META: Record<ItemStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "info" },
  scheduled: { label: "Scheduled", tone: "warn" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export interface ApprovalSummary {
  counts: Record<ItemStatus, number>;
  total: number;
  /** Items awaiting a reviewer decision (status === in_review). */
  pendingReview: number;
}

/** Tally a client's content items by status for the queue header. */
export function approvalSummary(items: Array<{ status: ItemStatus }>): ApprovalSummary {
  const counts = Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0])) as Record<
    ItemStatus,
    number
  >;
  for (const item of items) {
    if (item.status in counts) counts[item.status] += 1;
  }
  return { counts, total: items.length, pendingReview: counts.in_review };
}

/** The transitions an operator can drive from the dashboard for a given status. */
export function availableActions(
  status: ItemStatus,
): Array<{ action: "submit" | "approve" | "reject"; label: string; tone: Tone }> {
  switch (status) {
    case "draft":
      return [{ action: "submit", label: "Submit for review", tone: "info" }];
    case "in_review":
      return [
        { action: "approve", label: "Approve", tone: "success" },
        { action: "reject", label: "Send back", tone: "warn" },
      ];
    default:
      return [];
  }
}

/** A short caption preview for an item row, derived from its stored copy JSON. */
export function itemHeadline(copy: unknown): string {
  if (copy && typeof copy === "object") {
    const c = copy as { brief?: { idea?: unknown }; generated?: { caption?: unknown } };
    const idea = typeof c.brief?.idea === "string" ? c.brief.idea : undefined;
    const caption = typeof c.generated?.caption === "string" ? c.generated.caption : undefined;
    const text = idea ?? caption;
    if (text && text.trim()) return text.trim();
  }
  return "Untitled item";
}

/** Format a scheduled date for display; em dash when unset. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}
