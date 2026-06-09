// In-memory MediaStore for offline tests (no Prisma).
import {
  RETAINED_STATUSES,
  type MediaAsset,
  type MediaFilter,
  type MediaStore,
  type ReattachInput,
} from "./types";

interface Row extends MediaAsset {
  agencyId: string;
  clientId: string;
}

interface ItemRow {
  itemId: string;
  agencyId: string;
  clientId: string;
  status: string;
}

export class FakeMediaStore implements MediaStore {
  readonly assets: Row[] = [];
  readonly items: ItemRow[] = [];
  private seq = 0;

  seedItem(row: ItemRow): void {
    this.items.push(row);
  }

  seedAsset(row: {
    agencyId: string;
    clientId: string;
    contentItemId: string | null;
    kind?: string;
    url?: string;
    source?: string;
    contentHash?: string | null;
    groupId?: string | null;
    version?: number;
    archivedAt?: Date | null;
    createdAt?: Date;
  }): Row {
    const asset: Row = {
      id: `asset_${++this.seq}`,
      agencyId: row.agencyId,
      clientId: row.clientId,
      contentItemId: row.contentItemId,
      kind: row.kind ?? "image",
      url: row.url ?? `memory://${row.clientId}/${this.seq}.png`,
      source: row.source ?? "generated",
      contentHash: row.contentHash ?? null,
      groupId: row.groupId ?? null,
      version: row.version ?? 1,
      archivedAt: row.archivedAt ?? null,
      createdAt: row.createdAt ?? new Date(0),
    };
    this.assets.push(asset);
    return asset;
  }

  private strip(r: Row): MediaAsset {
    const { agencyId: _a, clientId: _c, ...rest } = r;
    return rest;
  }

  async listForClient(
    agencyId: string,
    clientId: string,
    filter: MediaFilter,
  ): Promise<MediaAsset[]> {
    return this.assets
      .filter(
        (r) =>
          r.agencyId === agencyId &&
          r.clientId === clientId &&
          (filter.includeArchived ? true : r.archivedAt === null) &&
          (!filter.kind || r.kind === filter.kind) &&
          (!filter.source || r.source === filter.source),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => this.strip(r));
  }

  async getForAgency(agencyId: string, assetId: string) {
    const r = this.assets.find((x) => x.id === assetId && x.agencyId === agencyId);
    if (!r) return null;
    return { ...this.strip(r), clientId: r.clientId };
  }

  async itemClient(agencyId: string, itemId: string) {
    const it = this.items.find((x) => x.itemId === itemId && x.agencyId === agencyId);
    return it ? { clientId: it.clientId } : null;
  }

  async createReattached(agencyId: string, input: ReattachInput): Promise<MediaAsset> {
    const item = this.items.find((x) => x.itemId === input.contentItemId && x.agencyId === agencyId);
    const asset: Row = {
      id: `asset_${++this.seq}`,
      agencyId,
      clientId: item?.clientId ?? "",
      contentItemId: input.contentItemId,
      kind: input.kind,
      url: input.url,
      source: "reused",
      contentHash: input.contentHash,
      groupId: input.groupId,
      version: input.version,
      archivedAt: null,
      createdAt: new Date(this.seq * 1000),
    };
    this.assets.push(asset);
    return this.strip(asset);
  }

  async anchorGroup(agencyId: string, assetId: string, groupId: string): Promise<void> {
    const r = this.assets.find((x) => x.id === assetId && x.agencyId === agencyId);
    if (r && r.groupId === null) r.groupId = groupId;
  }

  async nextVersion(agencyId: string, groupId: string): Promise<number> {
    const versions = this.assets
      .filter((r) => r.agencyId === agencyId && (r.groupId === groupId || r.id === groupId))
      .map((r) => r.version);
    return (versions.length ? Math.max(...versions) : 0) + 1;
  }

  async listVersions(agencyId: string, groupId: string): Promise<MediaAsset[]> {
    return this.assets
      .filter((r) => r.agencyId === agencyId && (r.groupId === groupId || r.id === groupId))
      .sort((a, b) => a.version - b.version)
      .map((r) => this.strip(r));
  }

  async setArchived(agencyId: string, assetId: string, archived: boolean): Promise<boolean> {
    const r = this.assets.find((x) => x.id === assetId && x.agencyId === agencyId);
    if (!r) return false;
    r.archivedAt = archived ? new Date(this.seq * 1000 + 1) : null;
    return true;
  }

  async archiveStale(agencyId: string, clientId: string, before: Date): Promise<number> {
    const protectedItems = new Set(
      this.items.filter((i) => RETAINED_STATUSES.includes(i.status)).map((i) => i.itemId),
    );
    let n = 0;
    for (const r of this.assets) {
      const reusable = r.source === "generated" || r.source === "reused";
      const inUse = r.contentItemId !== null && protectedItems.has(r.contentItemId);
      if (
        r.agencyId === agencyId &&
        r.clientId === clientId &&
        r.archivedAt === null &&
        reusable &&
        r.createdAt < before &&
        !inUse
      ) {
        r.archivedAt = before;
        n++;
      }
    }
    return n;
  }
}
