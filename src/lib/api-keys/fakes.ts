import type { ApiKeyRow, ApiKeyStore } from "./index";

export class FakeApiKeyStore implements ApiKeyStore {
  rows: ApiKeyRow[] = [];
  private seq = 0;

  async create(agencyId: string, data: { name: string; prefix: string; hashedKey: string }) {
    this.seq += 1;
    const row: ApiKeyRow = {
      id: `key-${this.seq}`,
      agencyId,
      name: data.name,
      prefix: data.prefix,
      lastUsedAt: null,
      revoked: false,
      createdAt: new Date("2026-06-09T00:00:00Z"),
    };
    // Stash the hash alongside for findByHash.
    this.hashes.set(row.id, data.hashedKey);
    this.rows.push(row);
    return row;
  }

  private hashes = new Map<string, string>();

  async findByHash(hashedKey: string) {
    for (const [id, h] of this.hashes) {
      if (h !== hashedKey) continue;
      const row = this.rows.find((r) => r.id === id);
      if (row && !row.revoked) return { id: row.id, agencyId: row.agencyId };
    }
    return null;
  }

  async touch(id: string) {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.lastUsedAt = new Date("2026-06-09T01:00:00Z");
  }

  async list(agencyId: string) {
    return this.rows.filter((r) => r.agencyId === agencyId);
  }

  async revoke(agencyId: string, id: string) {
    const row = this.rows.find((r) => r.id === id && r.agencyId === agencyId);
    if (!row || row.revoked) return false;
    row.revoked = true;
    return true;
  }
}
