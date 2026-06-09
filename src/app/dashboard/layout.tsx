// Dashboard shell (P4-03): authenticates every nested operator page and renders
// the top nav. Reviewers are bounced to their own portal by requirePageRole.
import Link from "next/link";
import { requirePageRole } from "@/lib/ui/page-auth";
import { STATUS_META } from "@/lib/ui/view-models";
import { LogoutButton } from "./_components/LogoutButton";

export const runtime = "nodejs";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = requirePageRole("agency_admin", "strategist");
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/dashboard" className="brand">
          Firstwave
        </Link>
        <nav>
          <Link href="/dashboard" className="muted">
            Clients
          </Link>
          <span className={`badge ${STATUS_META.approved.tone}`}>{auth.role}</span>
          <LogoutButton />
        </nav>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
