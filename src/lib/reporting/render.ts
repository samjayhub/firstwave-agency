// Pure HTML renderer for agency reports (P4-07). Self-contained inline-styled
// HTML — emails reliably and prints to PDF from any browser, with no PDF lib.
// White-label branded (brand name, logo, accent colour). Unit-tested for content.
import type { PublicBranding } from "@/lib/whitelabel/types";
import type { PerformanceReport } from "./types";

/** Escape user/derived text for safe interpolation into HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function renderReportHtml(
  report: PerformanceReport,
  branding: PublicBranding,
): string {
  const accent = branding.primaryColor ?? "#4F46E5";
  const brandName = escapeHtml(branding.brandName ?? "Firstwave");
  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${brandName}" style="height:32px" />`
    : `<strong style="font-size:18px">${brandName}</strong>`;

  const platformRows = report.byPlatform
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.platform)}</td>
        <td style="text-align:right">${num(p.posts)}</td>
        <td style="text-align:right">${num(p.impressions)}</td>
        <td style="text-align:right">${num(p.likes)}</td>
        <td style="text-align:right">${num(p.comments)}</td>
        <td style="text-align:right">${num(p.shares)}</td>
      </tr>`,
    )
    .join("");

  const topRows = report.topPosts
    .map(
      (t) =>
        `<li>${escapeHtml(t.idea)} <span style="color:#888">— ${escapeHtml(t.platform)}, ${num(
          t.impressions,
        )} impressions</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${brandName} — ${escapeHtml(report.clientName)} report</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto;padding:24px">
  <header style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${accent};padding-bottom:12px">
    ${logo}
    <span style="color:#666">Performance report</span>
  </header>
  <h1 style="margin:18px 0 2px">${escapeHtml(report.clientName)}</h1>
  <p style="color:#666;margin:0 0 18px">Last ${report.periodDays} days · generated ${escapeHtml(
    report.generatedAt.slice(0, 10),
  )}</p>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
    ${[
      ["Posts", report.totals.posts],
      ["Impressions", report.totals.impressions],
      ["Likes", report.totals.likes],
      ["Comments", report.totals.comments],
      ["Shares", report.totals.shares],
    ]
      .map(
        ([label, value]) =>
          `<div style="background:#f5f5f7;border-radius:8px;padding:10px 14px"><div style="font-size:20px;font-weight:700">${num(
            value as number,
          )}</div><div style="font-size:12px;color:#666">${label}</div></div>`,
      )
      .join("")}
  </div>

  <h2 style="font-size:15px">By platform</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr style="text-align:left;color:#666">
      <th>Platform</th><th style="text-align:right">Posts</th><th style="text-align:right">Impr.</th>
      <th style="text-align:right">Likes</th><th style="text-align:right">Comments</th><th style="text-align:right">Shares</th>
    </tr></thead>
    <tbody>${platformRows || `<tr><td colspan="6" style="color:#888">No data for this period.</td></tr>`}</tbody>
  </table>

  ${
    report.topPosts.length
      ? `<h2 style="font-size:15px;margin-top:20px">Top posts</h2><ul style="font-size:14px;line-height:1.6">${topRows}</ul>`
      : ""
  }

  <footer style="margin-top:28px;color:#999;font-size:12px">Sent by ${brandName}.</footer>
</body></html>`;
}
