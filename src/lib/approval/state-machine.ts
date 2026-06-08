// ContentItem approval state machine. Human approval gates every publish: only an
// `approved` item can be scheduled, and only the publish worker moves
// scheduled → published|failed. Transitions are pure + total so the rules live in
// one place.
import { ConflictError } from "@/lib/errors/app-error";

export type ItemStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

// Allowed transitions. Anything not listed is rejected.
const TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "draft"], // approve or send back
  approved: ["scheduled", "draft"], // schedule for publish, or pull back to edit
  scheduled: ["published", "failed", "approved"], // worker result, or cancel back to approved
  published: [], // terminal
  failed: ["scheduled", "draft"], // retry or edit
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ItemStatus, to: ItemStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Cannot move a content item from ${from} to ${to}`);
  }
}

export function isTerminal(status: ItemStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
