// Crawler contract. Kept free of any Playwright import so tests (which use a
// fixture crawler) never load a browser. The real implementation lives in
// ./playwright-crawler and is wired only in production.
import type { ImageCandidate } from "./logo";

export interface CrawledPage {
  url: string;
  title: string;
  /** Visible text, used to ground the LLM voice analysis. */
  text: string;
  /** Concatenated stylesheet + inline-style text, used for palette/fonts. */
  css: string;
  images: ImageCandidate[];
}

export interface BrandCrawler {
  crawl(url: string): Promise<CrawledPage>;
}
