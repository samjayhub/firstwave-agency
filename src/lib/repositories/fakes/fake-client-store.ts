// In-memory ClientStore for integration-style tests. Faithfully reproduces the
// query semantics the repository relies on: agency filtering, (createdAt desc,
// id desc) ordering, and cursor stepping — so tests exercise real pagination /
// scoping behavior without a database.
import type {
  ClientFindManyArgs,
  ClientRecord,
  ClientStore,
  ClientUpdateInput,
} from "../client-repository";

export class FakeClientStore implements ClientStore {
  private rows: ClientRecord[] = [];
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async create({
    data,
  }: {
    data: { agencyId: string; name: string; websiteUrl: string | null; niche: string | null };
  }): Promise<ClientRecord> {
    const row: ClientRecord = {
      id: `client_${(++this.seq).toString().padStart(4, "0")}`,
      agencyId: data.agencyId,
      name: data.name,
      websiteUrl: data.websiteUrl,
      niche: data.niche,
      createdAt: this.clock(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async findMany(args: ClientFindManyArgs): Promise<ClientRecord[]> {
    let rows = this.rows
      .filter((r) => r.agencyId === args.where.agencyId)
      .sort((a, b) => {
        const t = b.createdAt.getTime() - a.createdAt.getTime();
        if (t !== 0) return t;
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id desc
      });

    if (args.cursor) {
      const idx = rows.findIndex((r) => r.id === args.cursor!.id);
      if (idx >= 0) rows = rows.slice(idx + (args.skip ?? 1));
    }
    return rows.slice(0, args.take).map((r) => ({ ...r }));
  }

  async findFirst({
    where,
  }: {
    where: { id: string; agencyId: string };
  }): Promise<ClientRecord | null> {
    const row = this.rows.find((r) => r.id === where.id && r.agencyId === where.agencyId);
    return row ? { ...row } : null;
  }

  async update({
    where,
    data,
  }: {
    where: { id: string; agencyId: string };
    data: ClientUpdateInput;
  }): Promise<ClientRecord | null> {
    // Scoped write: only matches when BOTH id and agencyId match.
    const row = this.rows.find(
      (r) => r.id === where.id && r.agencyId === where.agencyId,
    );
    if (!row) return null;
    if (data.name !== undefined) row.name = data.name;
    if (data.websiteUrl !== undefined) row.websiteUrl = data.websiteUrl;
    if (data.niche !== undefined) row.niche = data.niche;
    return { ...row };
  }
}
