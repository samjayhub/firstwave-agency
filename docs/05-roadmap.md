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

## Phase 4 — Operate, learn & self-serve
Phases 1–3 built the full pipeline (brand → research/competitor/trend → plan → copy/creative/video/design → approval → publish → analytics) plus agency tooling (roles, billing, white-label, self-hosting). The pipeline can *produce and publish*, but it still runs on manual triggers, doesn't learn from results, and has no operator-facing UI. Phase 4 makes it **run continuously, improve itself, and be operable by humans and agencies directly**.

- **P4-01 Scheduling engine** — a clock-driven worker (BullMQ repeatable/delayed jobs) that auto-publishes `approved` items at their `scheduledAt`. Today `ContentItem.scheduledAt` exists but nothing fires due jobs — publishing is on-demand only. Timezone-aware per client; optional "best slot" heuristic seeded from analytics. *Done when:* an approved item publishes itself at its scheduled time with no manual call.
- **P4-02 Performance learning loop** — wire `AnalyticsSnapshot` history back into the Content Planner so the next plan is grounded in what actually performed (winning hooks/formats/cadence per client). The architecture's #10 → #5 loop is drawn but not connected — the planner never reads analytics today. *Done when:* a fresh plan demonstrably reflects the client's top-performing past content.
- **P4-03 Operator dashboard UI** — the Next.js dashboard the architecture assumes: client onboarding wizard, plan calendar, approval queue, connection management — wiring the existing APIs. Likely several PRs. *Done when:* a strategist can run the whole loop without touching the API directly.
- **P4-04 Client reviewer portal** — the shareable `client_reviewer` experience (approve / request-changes + threaded comments) the roles model promises but has no UI for. *Done when:* a reviewer with a share link can action items without an agency seat.
- **P4-05 Trend Engine v2** — add the TikTok Creative Center + YouTube trending sources architecture module #4 specified (only Google Trends shipped). Retire the stale Phase-0 `src/lib/trends/` stub in favor of the live `src/lib/trend/`. *Done when:* trend briefs aggregate ≥3 sources.
- **P4-06 Notifications & alerts** — email/Slack on approval requests, publish failures (dead-letter), and metric milestones, with per-user prefs. *Done when:* failures and pending approvals reach a human without polling the dashboard.
- **P4-07 Agency reporting** — periodic, white-label-branded client performance digests (PDF/email) aggregating `AnalyticsSnapshot`s across a client's connected accounts. *Done when:* an agency can send a branded monthly report on a schedule.
- **P4-08 Public API + webhooks** — token-scoped, per-agency API to read plans, push assets, and subscribe to publish/metric events, so agencies integrate Firstwave into their own stack. *Done when:* an external system can drive and observe the pipeline programmatically.
- **P4-09 Content safety & compliance gate** — pre-publish checks (platform policy, banned terms, ad/disclosure tags) as an approval sub-step. See [06-risks-and-compliance.md](06-risks-and-compliance.md). *Done when:* a non-compliant item is blocked before it can be approved.
- **P4-10 Media library** — browse, reuse, version, and lifecycle generated `Asset`s across a client (dedupe + storage retention). *Done when:* a past asset can be found and re-attached without regenerating.

**Suggested sequencing:** P4-01 + P4-02 first — they turn the already-built pipeline *autonomous and self-improving*, the highest leverage left. P4-03/04 (UI) next for day-to-day operability. The rest (intelligence, notifications, reporting, API, safety, media) are independent and can be picked by demand.

## Sequencing rationale
- **App review is the long pole** — start the one MVP platform's review paperwork on day 1 of Phase 1 (it runs in parallel with the build). See [06-risks-and-compliance.md](06-risks-and-compliance.md).
- **Defer the expensive + risky bits** (video compute, scraping/proxies, X) until the core loop is proven.
- **Phase 4 is demand-ordered, not gated** — every P4 item is independently shippable as its own `feat/p4-NN-<slug>` PR; pick by leverage (autonomy/learning first) rather than a fixed sequence.
