// In-memory AssetRepository for creative-studio tests.
import type { AssetRecord, AssetRepository, NewAsset } from "@/lib/creative";

export class FakeAssetRepository implements AssetRepository {
  private readonly rows: Array<
    AssetRecord & { agencyId: string; clientId?: string; contentHash?: string }
  > = [];
  private seq = 0;

  async create(agencyId: string, input: NewAsset): Promise<AssetRecord> {
    const row = {
      id: `asset_${++this.seq}`,
      agencyId,
      contentItemId: input.contentItemId,
      kind: input.kind,
      url: input.url,
      source: input.source,
      contentHash: input.contentHash,
      createdAt: new Date(0),
    };
    this.rows.push(row);
    const { agencyId: _omit, contentHash: _h, ...record } = row;
    return record;
  }

  async listForItem(agencyId: string, itemId: string): Promise<AssetRecord[]> {
    return this.rows
      .filter((r) => r.agencyId === agencyId && r.contentItemId === itemId)
      .map(({ agencyId: _a, contentHash: _h, ...rest }) => rest);
  }

  async findByHash(
    agencyId: string,
    _clientId: string,
    contentHash: string,
  ): Promise<{ id: string; url: string } | null> {
    // The fake has no item→client join, so match on agency + hash (sufficient
    // for the single-client setups these tests use).
    const r = this.rows.find((x) => x.agencyId === agencyId && x.contentHash === contentHash);
    return r ? { id: r.id, url: r.url } : null;
  }
}
