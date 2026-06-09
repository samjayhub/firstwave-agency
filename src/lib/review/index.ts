// Client reviewer portal (P4-04). The roles model promises a shareable approval
// queue for client_reviewers, but there was no UI or link mechanism for it. This
// service mints unguessable share links an agency hands to a client, and powers
// the public portal those links open: approve / request-changes + threaded
// comments, branded with the agency's white-label settings.
//
// AUDIT-EXEMPT: approval transitions are rule-based (non-LLM) actions — the item
// status history + ReviewComment rows are the trail.
import type { TenantContext } from "@/lib/db/tenancy";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { ComplianceGate } from "@/lib/compliance/types";
import type { BrandingStore, PublicBranding } from "@/lib/whitelabel/types";
import type {
  ResolvedShare,
  ReviewComment,
  ReviewQueueItem,
  ReviewShareRecord,
  ReviewStore,
} from "./types";

export * from "./types";

export type ReviewDecision = "approve" | "request_changes";

export interface ReviewPortal {
  clientName: string;
  branding: PublicBranding;
  items: ReviewQueueItem[];
}

export interface ReviewServiceDeps {
  store: ReviewStore;
  branding: BrandingStore;
  /** Generates an unguessable share token (injected for deterministic tests). */
  generateToken: () => string;
  /** Base URL used to build the shareable link. */
  baseUrl: string;
  /** Pre-approval compliance gate (P4-09); optional so the portal works without it. */
  compliance?: ComplianceGate;
}

const MAX_COMMENT_LEN = 2000;
const REVIEWER_AUTHOR = "Client reviewer";

export class ReviewService {
  constructor(private readonly deps: ReviewServiceDeps) {}

  // ── Admin side ────────────────────────────────────────────────
  /** Mint a share link for a client the caller's agency owns. */
  async createLink(
    ctx: TenantContext,
    clientId: string,
  ): Promise<{ share: ReviewShareRecord; url: string }> {
    const share = await this.deps.store.createShare(
      ctx.agencyId,
      clientId,
      this.deps.generateToken(),
    );
    if (!share) throw new NotFoundError("Client not found");
    return { share, url: this.linkUrl(share.token) };
  }

  async listLinks(
    ctx: TenantContext,
    clientId: string,
  ): Promise<Array<ReviewShareRecord & { url: string }>> {
    const shares = await this.deps.store.listShares(ctx.agencyId, clientId);
    return shares.map((s) => ({ ...s, url: this.linkUrl(s.token) }));
  }

  async revokeLink(ctx: TenantContext, shareId: string): Promise<void> {
    const ok = await this.deps.store.revokeShare(ctx.agencyId, shareId);
    if (!ok) throw new NotFoundError("Share link not found");
  }

  // ── Reviewer side (token) ─────────────────────────────────────
  /** Resolve a token into the portal payload (client, branding, queue). */
  async portal(token: string): Promise<ReviewPortal> {
    const share = await this.resolve(token);
    const [items, branding] = await Promise.all([
      this.deps.store.queueForClient(share.clientId),
      this.publicBranding(share.agencyId),
    ]);
    return { clientName: share.clientName, branding, items };
  }

  /** Apply a reviewer decision (+ optional comment) to one item. */
  async decide(
    token: string,
    itemId: string,
    decision: ReviewDecision,
    comment?: string,
  ): Promise<{ status: "approved" | "draft"; comment: ReviewComment | null }> {
    const share = await this.resolve(token);

    const item = await this.deps.store.getItem(share.clientId, itemId);
    if (!item) throw new NotFoundError("Content item not found");
    if (item.status !== "in_review") {
      throw new ValidationError("This item is not awaiting review");
    }

    const trimmed = comment?.trim();
    if (trimmed && trimmed.length > MAX_COMMENT_LEN) {
      throw new ValidationError("Comment is too long");
    }
    // request_changes requires a reason so the strategist knows what to fix.
    if (decision === "request_changes" && !trimmed) {
      throw new ValidationError("Please add a note explaining the requested changes");
    }

    // Compliance gate (P4-09): a reviewer can't approve a non-compliant item either.
    if (decision === "approve") {
      await this.deps.compliance?.assertApprovable(share.agencyId, itemId);
    }

    const to = decision === "approve" ? "approved" : "draft";
    const moved = await this.deps.store.transition(share.clientId, itemId, "in_review", to);
    if (!moved) throw new ValidationError("This item changed before your decision; please reload");

    let saved: ReviewComment | null = null;
    if (trimmed) {
      saved = await this.deps.store.addComment(share.clientId, itemId, trimmed, REVIEWER_AUTHOR);
    }
    return { status: to, comment: saved };
  }

  private async resolve(token: string): Promise<ResolvedShare> {
    const share = await this.deps.store.resolveShare(token);
    if (!share) throw new NotFoundError("This review link is invalid or has been revoked");
    return share;
  }

  private async publicBranding(agencyId: string): Promise<PublicBranding> {
    const rec = await this.deps.branding.getByAgency(agencyId);
    return {
      brandName: rec?.brandName ?? null,
      logoUrl: rec?.logoUrl ?? null,
      primaryColor: rec?.primaryColor ?? null,
    };
  }

  private linkUrl(token: string): string {
    return `${this.deps.baseUrl.replace(/\/$/, "")}/review/${token}`;
  }
}
