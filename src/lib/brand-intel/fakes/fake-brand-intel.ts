// Test doubles for brand-intel: a fixture crawler and an in-memory profile store.
import type { BrandCrawler, CrawledPage } from "../crawler";
import type { BrandProfileStore } from "../index";
import type { BrandProfileData } from "../types";

export class FakeCrawler implements BrandCrawler {
  constructor(private readonly page: CrawledPage) {}
  async crawl(url: string): Promise<CrawledPage> {
    return { ...this.page, url };
  }
}

export class FakeBrandProfileStore implements BrandProfileStore {
  private readonly byClient = new Map<string, BrandProfileData>();
  async upsert(clientId: string, data: BrandProfileData): Promise<void> {
    this.byClient.set(clientId, data);
  }
  async findByClient(clientId: string): Promise<BrandProfileData | null> {
    return this.byClient.get(clientId) ?? null;
  }
}
