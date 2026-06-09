import { describe, expect, it } from "vitest";
import { escapeHtml, renderReportHtml } from "./render";
import type { PerformanceReport } from "./types";

const REPORT: PerformanceReport = {
  clientId: "c1",
  clientName: "Acme Inc",
  periodDays: 30,
  generatedAt: "2026-06-09T00:00:00.000Z",
  totals: { posts: 3, impressions: 12345, likes: 10, comments: 2, shares: 5 },
  byPlatform: [
    { platform: "linkedin", posts: 2, impressions: 12000, likes: 10, comments: 2, shares: 5 },
  ],
  topPosts: [{ idea: "Launch teaser", platform: "linkedin", impressions: 9000, engagement: 25 }],
};

describe("escapeHtml", () => {
  it("escapes the dangerous characters", () => {
    expect(escapeHtml('<b>"x"</b> & y')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y");
  });
});

describe("renderReportHtml", () => {
  it("includes brand name, client, formatted numbers and top posts", () => {
    const html = renderReportHtml(REPORT, {
      brandName: "Studio X",
      logoUrl: null,
      primaryColor: "#ff0000",
    });
    expect(html).toContain("Studio X");
    expect(html).toContain("Acme Inc");
    expect(html).toContain("12,345"); // locale-formatted impressions
    expect(html).toContain("#ff0000"); // accent applied
    expect(html).toContain("Launch teaser");
  });

  it("falls back to Firstwave + default accent when branding is empty", () => {
    const html = renderReportHtml(REPORT, { brandName: null, logoUrl: null, primaryColor: null });
    expect(html).toContain("Firstwave");
    expect(html).toContain("#4F46E5");
  });

  it("escapes a malicious brand/client name", () => {
    const html = renderReportHtml(
      { ...REPORT, clientName: "<script>alert(1)</script>" },
      { brandName: null, logoUrl: null, primaryColor: null },
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
