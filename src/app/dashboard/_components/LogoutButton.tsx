"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Posts to the logout endpoint (same-origin → CSRF passes), then routes home. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn" onClick={logout} disabled={busy}>
      {busy ? "…" : "Log out"}
    </button>
  );
}
