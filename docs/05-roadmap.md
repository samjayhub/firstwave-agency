# 05 — Roadmap

> Phased plan with a deliberately small, self-contained MVP cut.

## Phase 0 — Spec (current)
Docs + repo scaffold. No app logic. **Done when:** this `docs/` set is approved and the scaffold builds.

## Phase 1 — MVP: the core loop, one platform, all in-house
Prove the wedge end-to-end with ~$0 recurring SaaS.

**Scope (the cut line):**
1. Auth + agency/client setup (multi-tenant foundation).
2. **Brand Intelligence** — paste website + social URLs → `BrandProfile` (palette, fonts, logo, voice). In-house extraction.
3. **Content Planner** — generate a 30-day calendar from the BrandProfile.
4. **Copy Engine** — captions/hooks/hashtags/descriptions per item, in brand voice.
5. **Creative Studio (image only)** — hosted image gen for each item; brand palette/fonts injected.
6. **Approval queue** — `draft → in_review → approved`; shareable reviewer view.
7. **Publishing** — **one** platform via its own official API (LinkedIn *or* Meta Graph — whichever app-review clears first).

**Explicitly out of MVP:** competitor scraping (use **manual competitor URLs**), trend automation, video, multi-platform, X, self-hosting.

**Done when:** an agency can onboard a client, get a brand-aligned 30-day plan with copy + images, approve items, and publish to one real account.

## Phase 2 — Intelligence
- **Competitor Intelligence** in-house (YouTube Data API + own scrapers) → reverse-engineer + upgrade briefs feeding the planner.
- **Trend Engine** (Google Trends + TikTok Creative Center + YouTube trending).
- **2–3 more platform adapters** (e.g., IG/FB, YouTube).
- **Analytics feedback** loop → next plan learns from performance.

**Done when:** plans are measurably informed by competitor + trend data, and publishing spans multiple platforms.

## Phase 3 — Video & scale
- **Creative Studio video** + **YouTube long-form** pain-point pipeline (script → B-roll → TTS → assembly).
- **Optional self-hosting** of open gen models on GPU once volume beats metered pricing.
- **Richer agency tooling** (roles, billing via Stripe, client white-label).
- **Add X** if a client needs it (accept the paid API).
- Evolve the automated design path toward Lovart's specialist-agents pattern.

## Sequencing rationale
- **App review is the long pole** — start the one MVP platform's review paperwork on day 1 of Phase 1 (it runs in parallel with the build). See [06-risks-and-compliance.md](06-risks-and-compliance.md).
- **Defer the expensive + risky bits** (video compute, scraping/proxies, X) until the core loop is proven.
