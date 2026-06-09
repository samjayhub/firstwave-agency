import { STATUS_META } from "@/lib/ui/view-models";
import type { ItemStatus } from "@/lib/approval/state-machine";

/** Coloured pill for a content item's pipeline status. */
export function StatusBadge({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>;
}
