// In-memory AssetRepository for creative-studio tests.
import type { AssetRecord, AssetRepository, NewAsset } from "@/lib/creative";

export class FakeAssetRepository implements AssetRepository {
  private readonly rows: Array<AssetRecord & { agencyId: string }> = [];
  private seq = 0;

  async create(agencyId: string, input: NewAsset): Promise<AssetRecord> {
    const row = {
      id: `asset_${++this.seq}`,
      agencyId,
      contentItemId: input.contentItemId,
      kind: input.kind,
      url: input.url,
      source: input.source,
      createdAt: new Date(0),
    };
    this.rows.push(row);
    const { agencyId: _omit, ...record } = row;
    return record;
  }

  async listForItem(agencyId: string, itemId: string): Promise<AssetRecord[]> {
    return this.rows
      .filter((r) => r.agencyId === agencyId && r.contentItemId === itemId)
      .map(({ agencyId: _a, ...rest }) => rest);
  }
}
