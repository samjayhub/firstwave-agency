// In-memory fakes for the publish flow (approval, connected accounts, jobs).
import type { ApprovalItem, ApprovalStore, ItemStatus } from "@/lib/approval";
import type {
  ConnectedAccountRecord,
  ConnectedAccountRepository,
  NewConnectedAccount,
} from "@/lib/connections";
import type { PublishJobStore, PublishState } from "@/lib/publish/job";
import type { Platform } from "@/lib/publishers/types";

export class FakeApprovalStore implements ApprovalStore {
  readonly items = new Map<string, ApprovalItem & { agencyId: string }>();

  seed(row: ApprovalItem & { agencyId: string }): void {
    this.items.set(row.id, { ...row });
  }

  async get(agencyId: string, itemId: string): Promise<ApprovalItem | null> {
    const row = this.items.get(itemId);
    if (!row || row.agencyId !== agencyId) return null;
    const { agencyId: _a, ...rest } = row;
    return rest;
  }

  async transition(agencyId: string, itemId: string, from: ItemStatus, to: ItemStatus) {
    const row = this.items.get(itemId);
    if (!row || row.agencyId !== agencyId || row.status !== from) return false;
    row.status = to;
    return true;
  }

  async listByClient(agencyId: string, clientId: string, status?: ItemStatus) {
    return [...this.items.values()]
      .filter(
        (r) =>
          r.agencyId === agencyId && r.clientId === clientId && (!status || r.status === status),
      )
      .map(({ agencyId: _a, ...rest }) => rest);
  }
}

export class FakeConnectedAccountRepository implements ConnectedAccountRepository {
  readonly rows: Array<ConnectedAccountRecord & { agencyId: string }> = [];
  private seq = 0;

  async create(agencyId: string, input: NewConnectedAccount) {
    const row = {
      id: `acct_${++this.seq}`,
      agencyId,
      clientId: input.clientId,
      platform: input.platform,
      externalId: input.externalId,
      handle: input.handle ?? null,
      accessTokenEnc: input.accessTokenEnc,
      refreshTokenEnc: input.refreshTokenEnc ?? null,
      expiresAt: input.expiresAt ?? null,
    };
    this.rows.push(row);
    return { id: row.id };
  }

  async getForAgency(agencyId: string, accountId: string): Promise<ConnectedAccountRecord | null> {
    const row = this.rows.find((r) => r.id === accountId && r.agencyId === agencyId);
    if (!row) return null;
    const { agencyId: _a, ...rest } = row;
    return rest;
  }

  async listForClient(agencyId: string, clientId: string) {
    return this.rows
      .filter((r) => r.agencyId === agencyId && r.clientId === clientId)
      .map((r) => ({ id: r.id, platform: r.platform as Platform, handle: r.handle, externalId: r.externalId }));
  }
}

export class FakePublishJobStore implements PublishJobStore {
  readonly jobs: Array<{ id: string; contentItemId: string; platform: Platform; state: PublishState; externalId?: string; error?: string }> = [];
  private seq = 0;

  async create(input: { contentItemId: string; platform: Platform; state: PublishState }) {
    const job = { id: `job_${++this.seq}`, ...input };
    this.jobs.push(job);
    return { id: job.id };
  }

  async markResult(id: string, result: { state: "published" | "failed"; externalId?: string; error?: string }) {
    const job = this.jobs.find((j) => j.id === id);
    if (job) Object.assign(job, result);
  }
}
