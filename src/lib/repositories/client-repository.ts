// Client repository — the representative tenant-scoped repository pattern that
// PR3+ extend per resource. Every method takes a TenantContext and enforces
// row-level agencyId scoping; a caller can never reach another agency's rows.
//
// It depends on a narrow ClientStore interface (not PrismaClient) so the logic —
// scoping, cursor pagination, not-found mapping — is testable against an
// in-memory fake. The Prisma-backed implementation lives in ./prisma-stores.

import {
  buildCursorArgs,
  toCursorPage,
  type CursorPage,
  type CursorPageParams,
} from "@/lib/db/pagination";
import { withDbErrors } from "@/lib/db/errors";
import { NotFoundError } from "@/lib/errors/app-error";
import { assertAgencyId, scopedWhere, type TenantContext } from "@/lib/db/tenancy";

export interface ClientRecord {
  id: string;
  agencyId: string;
  name: string;
  websiteUrl: string | null;
  niche: string | null;
  createdAt: Date;
}

export interface ClientCreateInput {
  name: string;
  websiteUrl?: string | null;
  niche?: string | null;
}

export interface ClientUpdateInput {
  name?: string;
  websiteUrl?: string | null;
  niche?: string | null;
}

export interface ClientFindManyArgs {
  where: { agencyId: string };
  take: number;
  orderBy: Array<{ createdAt: "desc" } | { id: "desc" }>;
  cursor?: { id: string };
  skip?: number;
}

/** The subset of persistence operations the repository needs. */
export interface ClientStore {
  create(args: {
    data: { agencyId: string; name: string; websiteUrl: string | null; niche: string | null };
  }): Promise<ClientRecord>;
  findMany(args: ClientFindManyArgs): Promise<ClientRecord[]>;
  findFirst(args: { where: { id: string; agencyId: string } }): Promise<ClientRecord | null>;
  update(args: { where: { id: string }; data: ClientUpdateInput }): Promise<ClientRecord>;
}

export class ClientRepository {
  constructor(private readonly store: ClientStore) {}

  async create(ctx: TenantContext, input: ClientCreateInput): Promise<ClientRecord> {
    const agencyId = assertAgencyId(ctx.agencyId);
    return withDbErrors(
      () =>
        this.store.create({
          data: {
            agencyId,
            name: input.name,
            websiteUrl: input.websiteUrl ?? null,
            niche: input.niche ?? null,
          },
        }),
      "Client",
    );
  }

  async list(ctx: TenantContext, params: CursorPageParams = {}): Promise<CursorPage<ClientRecord>> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const args = buildCursorArgs(scopedWhere(agencyId), params);
    const rows = await withDbErrors(() => this.store.findMany(args), "Client");
    return toCursorPage(rows, params);
  }

  async get(ctx: TenantContext, id: string): Promise<ClientRecord> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const row = await withDbErrors(
      () => this.store.findFirst({ where: { id, agencyId } }),
      "Client",
    );
    if (!row) throw new NotFoundError("Client not found");
    return row;
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: ClientUpdateInput,
  ): Promise<ClientRecord> {
    // get() enforces that the client belongs to this agency before we mutate.
    await this.get(ctx, id);
    return withDbErrors(() => this.store.update({ where: { id }, data: input }), "Client");
  }
}
