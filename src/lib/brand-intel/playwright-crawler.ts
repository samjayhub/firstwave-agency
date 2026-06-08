// Production crawler — Playwright/Chromium. Requires browsers to be installed in
// the deploy environment (`npx playwright install chromium`). Long-running, so
// in production this runs inside the BullMQ brand-extract job (see PR7 worker),
// not synchronously in a request.
import { chromium } from "playwright";
import type { BrandCrawler, CrawledPage } from "./crawler";
import { isIpv4Literal, isPrivateIp } from "./url-guard";

const NAV_TIMEOUT_MS = 30_000;
const MAX_TEXT = 20_000;
const MAX_CSS = 200_000;

export class PlaywrightCrawler implements BrandCrawler {
  async crawl(url: string): Promise<CrawledPage> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();

      // Defense-in-depth against redirect/subrequest SSRF: abort any request to a
      // private IP literal (e.g. a 302 to 169.254.169.254). The pre-navigation
      // DNS check in url-guard handles hostname targets; running this crawler in a
      // network-isolated egress closes the residual DNS-rebinding gap.
      await page.route("**/*", (route) => {
        try {
          const host = new URL(route.request().url()).hostname.replace(/^\[|\]$/g, "");
          if ((isIpv4Literal(host) || host.includes(":")) && isPrivateIp(host)) {
            void route.abort("blockedbyclient");
            return;
          }
        } catch {
          // fall through to continue
        }
        void route.continue();
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      const title = await page.title();

      const text = await page.evaluate(
        (max) => document.body?.innerText?.slice(0, max) ?? "",
        MAX_TEXT,
      );

      const css = await page.evaluate((max) => {
        let out = "";
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) out += rule.cssText + "\n";
          } catch {
            // cross-origin stylesheet — skip
          }
        }
        for (const el of Array.from(document.querySelectorAll("[style]"))) {
          out += (el.getAttribute("style") ?? "") + "\n";
        }
        return out.slice(0, max);
      }, MAX_CSS);

      const images = await page.evaluate(() => {
        const headerImgs = new Set(Array.from(document.querySelectorAll("header img")));
        return Array.from(document.querySelectorAll("img"))
          .slice(0, 50)
          .map((img) => ({
            src: img.currentSrc || img.src,
            alt: img.alt || undefined,
            className: typeof img.className === "string" ? img.className : undefined,
            id: img.id || undefined,
            inHeader: headerImgs.has(img),
          }));
      });

      return { url, title, text, css, images };
    } finally {
      await browser.close();
    }
  }
}
