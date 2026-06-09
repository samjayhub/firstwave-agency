// In-memory ComplianceStore for offline tests (no Prisma/Redis).
import {
  defaultConfig,
  type ComplianceConfig,
  type ComplianceConfigPatch,
  type ComplianceItem,
  type ComplianceStore,
} from "./types";

export class FakeComplianceStore implements ComplianceStore {
  private items = new Map<string, ComplianceItem & { agencyId: string }>();
  private configs = new Map<string, ComplianceConfig>();

  seedItem(agencyId: string, itemId: string, item: ComplianceItem): void {
    this.items.set(itemId, { ...item, agencyId });
  }

  seedConfig(agencyId: string, config: Partial<ComplianceConfig>): void {
    this.configs.set(agencyId, { ...defaultConfig(), ...config });
  }

  async loadItem(agencyId: string, itemId: string): Promise<ComplianceItem | null> {
    const row = this.items.get(itemId);
    if (!row || row.agencyId !== agencyId) return null;
    return { copy: row.copy, platforms: row.platforms };
  }

  async getConfig(agencyId: string): Promise<ComplianceConfig | null> {
    return this.configs.get(agencyId) ?? null;
  }

  async upsertConfig(agencyId: string, patch: ComplianceConfigPatch): Promise<ComplianceConfig> {
    const next = { ...(this.configs.get(agencyId) ?? defaultConfig()), ...patch };
    this.configs.set(agencyId, next);
    return next;
  }
}
