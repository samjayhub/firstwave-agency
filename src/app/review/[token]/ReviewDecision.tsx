"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Reviewer controls for one item: a note plus Approve / Request changes. Posts
 * to the public decide endpoint (same-origin → CSRF passes) and refreshes.
 */
export function ReviewDecision({ token, itemId }: { token: string; itemId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "request_changes") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, decision, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Could not save your decision");
        return;
      }
      setComment("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <textarea
          placeholder="Add a note (required to request changes)…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            padding: "0.5rem 0.6rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text)",
            fontFamily: "inherit",
            fontSize: "0.9rem",
          }}
        />
      </div>
      {error ? <div className="form-error">{error}</div> : null}
      <div className="btn-group">
        <button className="btn primary" disabled={busy} onClick={() => decide("approve")}>
          Approve
        </button>
        <button className="btn" disabled={busy} onClick={() => decide("request_changes")}>
          Request changes
        </button>
      </div>
    </div>
  );
}
