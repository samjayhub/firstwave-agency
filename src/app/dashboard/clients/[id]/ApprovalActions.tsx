"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { availableActions } from "@/lib/ui/view-models";
import type { ItemStatus } from "@/lib/approval/state-machine";

/**
 * Drives the approval state machine for one item from the queue. Each button
 * POSTs to the matching content-item route (same-origin → CSRF passes) and
 * refreshes the server component on success.
 */
export function ApprovalActions({ itemId, status }: { itemId: string; status: ItemStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = availableActions(status);

  if (actions.length === 0) return null;

  async function run(action: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${itemId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="btn-group">
      {actions.map((a) => (
        <button
          key={a.action}
          className={`btn ${a.action === "approve" ? "primary" : ""}`}
          disabled={busy}
          onClick={() => run(a.action)}
        >
          {a.label}
        </button>
      ))}
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
