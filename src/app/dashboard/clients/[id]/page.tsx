// Client pipeline view (P4-03): the approval queue + what the next plan will
// learn from. Reads through the same services the API routes use, scoped to the
// operator's agency. Mutations happen via the ApprovalActions client island.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/ui/page-auth";
import {
  approvalService,
  clientRepository,
  performanceService,
} from "@/app/api/_lib/deps";
import { NotFoundError } from "@/lib/errors/app-error";
import { approvalSummary, formatDate, itemHeadline, STATUS_META } from "@/lib/ui/view-models";
import { StatusBadge } from "../../_components/StatusBadge";
import { ApprovalActions } from "./ApprovalActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const auth = requirePageRole("agency_admin", "strategist");

  let clientName: string;
  try {
    clientName = (await clientRepository().get(auth.ctx, params.id)).name;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const [items, performance] = await Promise.all([
    approvalService().list(auth.ctx, params.id),
    performanceService().brief(auth.ctx, params.id),
  ]);
  const summary = approvalSummary(items);

  return (
    <main>
      <p className="muted">
        <Link href="/dashboard">← Clients</Link>
      </p>
      <h1 className="page-title">{clientName}</h1>
      <div className="stat-grid">
        {Object.entries(summary.counts).map(([status, count]) => (
          <span key={status} className={`badge ${STATUS_META[status as keyof typeof STATUS_META].tone}`}>
            {STATUS_META[status as keyof typeof STATUS_META].label}: {count}
          </span>
        ))}
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Approval queue ({summary.pendingReview} awaiting review)</h2>
        {items.length === 0 ? (
          <p className="muted">No content items yet. Generate a plan to populate the queue.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="row">
              <div>
                <div className="headline">{itemHeadline(item.copy)}</div>
                <div className="muted" style={{ fontSize: "0.82rem" }}>
                  Scheduled {formatDate(item.scheduledAt)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <ApprovalActions itemId={item.id} status={item.status} />
                <StatusBadge status={item.status} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>What the next plan will learn from</h2>
        {performance ? (
          <>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Based on {performance.sampleSize} published post
              {performance.sampleSize === 1 ? "" : "s"}.
            </p>
            <div className="chips">
              {performance.topPillars.map((p) => (
                <span key={`pillar-${p}`} className="chip">
                  #{p}
                </span>
              ))}
              {performance.topFormats.map((f) => (
                <span key={`format-${f}`} className="chip">
                  {f}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">No published posts measured yet — the loop kicks in after the first results land.</p>
        )}
      </div>
    </main>
  );
}
