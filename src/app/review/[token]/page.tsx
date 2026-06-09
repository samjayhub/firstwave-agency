// Public client reviewer portal (P4-04). No session — the unguessable token in
// the URL is the credential. Branded with the agency's white-label settings.
import { reviewService } from "@/app/api/_lib/deps";
import { NotFoundError } from "@/lib/errors/app-error";
import { formatDate, itemHeadline } from "@/lib/ui/view-models";
import { ReviewDecision } from "./ReviewDecision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReviewPortalPage({ params }: { params: { token: string } }) {
  let portal;
  try {
    portal = await reviewService().portal(params.token);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <main className="auth-wrap">
          <h1 className="page-title">Link unavailable</h1>
          <p className="muted">This review link is invalid or has been revoked.</p>
        </main>
      );
    }
    throw err;
  }

  const accent = portal.branding.primaryColor ?? "var(--primary)";
  const brandName = portal.branding.brandName ?? "Firstwave";

  return (
    <div className="shell">
      <header className="topbar" style={{ borderBottomColor: accent }}>
        <span className="brand" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {portal.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portal.branding.logoUrl} alt={brandName} height={24} />
          ) : null}
          {brandName}
        </span>
        <span className="muted">Review for {portal.clientName}</span>
      </header>

      <div className="container">
        <h1 className="page-title">Items awaiting your review</h1>
        {portal.items.length === 0 ? (
          <div className="card">
            <p className="muted">Nothing to review right now. Thanks for checking in!</p>
          </div>
        ) : (
          portal.items.map((item) => (
            <div key={item.id} className="card">
              <h2>{itemHeadline(item.copy)}</h2>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Scheduled {formatDate(item.scheduledAt)}
              </p>

              {item.comments.length > 0 ? (
                <div style={{ margin: "0.5rem 0 0.9rem" }}>
                  {item.comments.map((c) => (
                    <div key={c.id} className="row" style={{ fontSize: "0.88rem" }}>
                      <span>{c.body}</span>
                      <span className="muted">{c.author}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <ReviewDecision token={params.token} itemId={item.id} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
