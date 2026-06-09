// Agency reporting (P4-07). Builds a white-label-branded client performance
// report from stored AnalyticsSnapshots, renders it to self-contained HTML
// (emailable + printable to PDF), and either returns it or emails it. A scheduled
// digest (runDigest) sends one per client to each agency's configured recipient.
//
// AUDIT-EXEMPT: reads metrics + deterministic render; no generative model call.
import type { TenantContext } from "@/lib/db/tenancy";
import { ValidationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import { ClientRepository } from "@/lib/repositories/client-repository";
import type { BrandingStore, PublicBranding } from "@/lib/whitelabel/types";
import { buildReport } from "./build";
import { renderReportHtml } from "./render";
import type { PerformanceReport, ReportSender, ReportStore } from "./types";

export * from "./types";
export { buildReport } from "./build";
export { renderReportHtml, escapeHtml } from "./render";

const DEFAULT_PERIOD_DAYS = 30;
const MAX_PERIOD_DAYS = 365;

export interface ReportServiceDeps {
  store: ReportStore;
  branding: BrandingStore;
  clients: ClientRepository;
  sendEmail: ReportSender;
  clock?: () => Date;
}

export class ReportService {
  private readonly clock: () => Date;

  constructor(private readonly deps: ReportServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private clampDays(days?: number): number {
    if (!days || !Number.isInteger(days) || days < 1) return DEFAULT_PERIOD_DAYS;
    return Math.min(days, MAX_PERIOD_DAYS);
  }

  private since(periodDays: number): Date {
    return new Date(this.clock().getTime() - periodDays * 24 * 60 * 60 * 1000);
  }

  /** Build the report data for a client (ownership checked). */
  async build(ctx: TenantContext, clientId: string, days?: number): Promise<PerformanceReport> {
    const client = await this.deps.clients.get(ctx, clientId); // throws if not owned
    return this.buildFor(ctx.agencyId, clientId, client.name, days);
  }

  /** Build without the ownership round-trip — for the digest, whose targets are
   *  already DB-resolved (agencyId + clientName supplied). */
  private async buildFor(
    agencyId: string,
    clientId: string,
    clientName: string,
    days?: number,
  ): Promise<PerformanceReport> {
    const periodDays = this.clampDays(days);
    const rows = await this.deps.store.snapshotsForClient(
      agencyId,
      clientId,
      this.since(periodDays),
    );
    return buildReport(clientId, clientName, rows, periodDays, this.clock());
  }

  private async branding(agencyId: string): Promise<PublicBranding> {
    const rec = await this.deps.branding.getByAgency(agencyId);
    return {
      brandName: rec?.brandName ?? null,
      logoUrl: rec?.logoUrl ?? null,
      primaryColor: rec?.primaryColor ?? null,
    };
  }

  /** Build + render a client report to branded HTML. */
  async renderHtml(ctx: TenantContext, clientId: string, days?: number): Promise<string> {
    const report = await this.build(ctx, clientId, days);
    return renderReportHtml(report, await this.branding(ctx.agencyId));
  }

  /** Build, render and email a report. Recipient defaults to branding.supportEmail. */
  async send(
    ctx: TenantContext,
    clientId: string,
    opts: { to?: string; days?: number } = {},
  ): Promise<{ to: string }> {
    const report = await this.build(ctx, clientId, opts.days);
    const brandingRec = await this.deps.branding.getByAgency(ctx.agencyId);
    const to = opts.to ?? brandingRec?.supportEmail ?? null;
    if (!to) {
      throw new ValidationError(
        "No recipient: pass `to`, or set a support email in white-label settings",
      );
    }
    const html = renderReportHtml(report, {
      brandName: brandingRec?.brandName ?? null,
      logoUrl: brandingRec?.logoUrl ?? null,
      primaryColor: brandingRec?.primaryColor ?? null,
    });
    await this.deps.sendEmail({
      to,
      subject: `${brandingRec?.brandName ?? "Firstwave"} — ${report.clientName} performance report`,
      html,
    });
    return { to };
  }

  /**
   * Scheduled digest: email one report per client to each agency's configured
   * recipient. Per-target failures are isolated and logged. Returns the count sent.
   */
  async runDigest(days?: number): Promise<{ sent: number }> {
    const targets = await this.deps.store.digestTargets();
    let sent = 0;
    for (const target of targets) {
      try {
        const report = await this.buildFor(
          target.agencyId,
          target.clientId,
          target.clientName,
          days,
        );
        const html = renderReportHtml(report, await this.branding(target.agencyId));
        await this.deps.sendEmail({
          to: target.recipient,
          subject: `${report.clientName} performance report`,
          html,
        });
        sent += 1;
      } catch (err) {
        logger.error("report digest failed for client", {
          clientId: target.clientId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { sent };
  }
}
