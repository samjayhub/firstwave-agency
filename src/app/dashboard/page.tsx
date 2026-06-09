// Operator home (P4-03): the agency's clients, each a link into its pipeline.
import Link from "next/link";
import { requirePageRole } from "@/lib/ui/page-auth";
import { clientRepository } from "@/app/api/_lib/deps";
import { formatDate } from "@/lib/ui/view-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const auth = requirePageRole("agency_admin", "strategist");
  const page = await clientRepository().list(auth.ctx, { limit: 50 });

  return (
    <main>
      <h1 className="page-title">Clients</h1>
      <p className="muted">Pick a client to run the content pipeline.</p>

      <div className="card">
        {page.items.length === 0 ? (
          <p className="muted">No clients yet. Onboard one to get started.</p>
        ) : (
          page.items.map((client) => (
            <Link key={client.id} href={`/dashboard/clients/${client.id}`} className="row">
              <span className="headline">{client.name}</span>
              <span className="muted">{client.niche ?? formatDate(client.createdAt)}</span>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
