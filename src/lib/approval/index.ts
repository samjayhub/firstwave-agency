// Approval workflow service. Drives the ContentItem through the state machine,
// scoped to the caller's agency. The store does an optimistic conditional update
// (where status = expected) so concurrent approvals can't double-apply.
import type { TenantContext } from "@/lib/db/tenancy";
import { ConflictError, NotFoundError } from "@/lib/errors/app-error";
import type { ComplianceGate } from "@/lib/compliance/types";
import { assertTransition, type ItemStatus } from "./state-machine";

export * from "./state-machine";

export interface ApprovalItem {
  id: string;
  clientId: string;
  status: ItemStatus;
  scheduledAt: Date | null;
  copy: unknown;
}

export interface ApprovalStore {
  get(agencyId: string, itemId: string): Promise<ApprovalItem | null>;
  /** Conditional update: only flips when current status === from. Returns success. */
  transition(
    agencyId: string,
    itemId: string,
    from: ItemStatus,
    to: ItemStatus,
  ): Promise<boolean>;
  listByClient(
    agencyId: string,
    clientId: string,
    status?: ItemStatus,
  ): Promise<ApprovalItem[]>;
}

export class ApprovalService {
  // `compliance` is the P4-09 pre-approval gate: an optional collaborator so the
  // approval state machine stays usable (and testable) without it.
  constructor(
    private readonly store: ApprovalStore,
    private readonly compliance?: ComplianceGate,
  ) {}

  private async move(ctx: TenantContext, itemId: string, to: ItemStatus): Promise<ApprovalItem> {
    const item = await this.store.get(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");
    assertTransition(item.status, to); // pure rule check → ConflictError if illegal
    // Compliance gate (P4-09): a non-compliant item is blocked before approval.
    if (to === "approved") await this.compliance?.assertApprovable(ctx.agencyId, itemId);
    const ok = await this.store.transition(ctx.agencyId, itemId, item.status, to);
    if (!ok) {
      throw new ConflictError("Content item changed concurrently; please retry");
    }
    return { ...item, status: to };
  }

  submit(ctx: TenantContext, itemId: string) {
    return this.move(ctx, itemId, "in_review"); // draft → in_review
  }
  approve(ctx: TenantContext, itemId: string) {
    return this.move(ctx, itemId, "approved"); // in_review → approved
  }
  reject(ctx: TenantContext, itemId: string) {
    return this.move(ctx, itemId, "draft"); // in_review → draft (back to edit)
  }

  /** Mark approved → scheduled (the human gate before a publish job is enqueued). */
  schedule(ctx: TenantContext, itemId: string) {
    return this.move(ctx, itemId, "scheduled");
  }

  async get(ctx: TenantContext, itemId: string): Promise<ApprovalItem> {
    const item = await this.store.get(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");
    return item;
  }

  list(ctx: TenantContext, clientId: string, status?: ItemStatus) {
    return this.store.listByClient(ctx.agencyId, clientId, status);
  }
}
