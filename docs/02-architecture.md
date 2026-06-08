# 02 — Architecture

> System + module architecture. Stack: **Next.js (App Router) + TypeScript**, build-first.

## 1. System shape

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js (App Router) — TypeScript                          │
│  • Dashboard UI (React Server Components + client islands)  │
│  • Route Handlers / Server Actions = the API layer         │
└───────────────┬─────────────────────────────────────────────┘
                │
        ┌───────┴────────┐
        │  Job queue     │  BullMQ + Redis — long-running AI/research jobs
        │  (workers)     │  (brand extraction, competitor sweep, generation, publish)
        └───────┬────────┘
                │
   ┌────────────┼───────────────┬──────────────────┐
   │            │               │                  │
┌──┴───┐  ┌─────┴──────┐  ┌─────┴──────┐   ┌───────┴────────┐
│Postgres│ │ pgvector   │  │ Object     │   │ External       │
│+Prisma │ │ (embeddings)│ │ storage    │   │ services       │
│        │ │            │  │ (S3/R2)    │   │ (see §3)       │
└────────┘ └────────────┘  └────────────┘   └────────────────┘
```

- **Web/API:** Next.js App Router. Server Actions + Route Handlers are the API surface — no separate backend service for MVP.
- **Async work:** BullMQ on Redis. Every module that calls an LLM, generates media, scrapes, or publishes runs as a **job** (retryable, observable), never inline in a request.
- **Data:** Postgres via Prisma. `pgvector` extension for brand-voice + competitor-post embeddings (grounding / similarity).
- **Media:** Object storage (S3-compatible, e.g. Cloudflare R2) for generated images/video.
- **LLM:** Anthropic SDK (Claude). Model IDs per the project's claude-api reference.

## 2. Multi-tenant model (agency-first)

```
Agency (tenant)
 └─ Client
     ├─ BrandProfile        voice, palette, fonts, logo, do/don't
     ├─ ConnectedAccount[]  IG, FB, TikTok, YouTube, LinkedIn (X deferred) — OAuth tokens
     ├─ Competitor[]        discovered + tracked, with CompetitorInsight[]
     ├─ ContentPlan[]       30-day calendars
     │   └─ ContentItem[]   copy + creative + schedule + approval state
     └─ Asset[]             generated images / video
```

- **Isolation:** every row scoped by `agencyId`. Enforced in a Prisma middleware / query helper so no query can cross tenants.
- **Roles:** `agency_admin`, `strategist`, `client_reviewer`. The reviewer sees only a shareable approval queue for their client.

Full schema: [03-data-model.md](03-data-model.md).

## 3. Module breakdown

Each module is an independent service module (`src/lib/<module>/`) invoked by jobs. Modules that depend on external services are marked **BUILD** (we own the code) or **BUY** (metered compute / platform API). Rationale: [04-integrations.md](04-integrations.md).

| # | Module | Build/Buy | What it does |
|---|---|---|---|
| 1 | **Brand Intelligence** | BUILD | Playwright crawl → `node-vibrant` palette + font-face parse + logo heuristic; Claude derives voice/tone/audience/do-don't from copy + public posts → `BrandProfile`. |
| 2 | **Research Engine** | BUILD + LLM | Niche briefs via web search/fetch + Claude synthesis → angles, pain points, pillars. |
| 3 | **Competitor Intelligence** | BUILD | YouTube Data API (free) + own scrapers → rank by engagement/cadence/format; Claude extracts hooks/formats/rhythm → "reverse-engineer + upgrade" brief. MVP: YouTube + manual URLs. |
| 4 | **Trend Engine** | BUILD | Google Trends (public) + TikTok Creative Center scraper + YouTube trending → timely angles. |
| 5 | **Content Planner** | LLM | Claude builds the 30-day calendar grounded in BrandProfile + competitor + trend inputs. |
| 6 | **Creative Studio** | BUY (compute) | Automated path: hosted image gen (Imagen 4 Fast / Ideogram v3 / Nano Banana 2) + video (Veo/Sora, Phase 3) + TTS. Optional manual **Lovart** path (no API). |
| 7 | **Copy Engine** | LLM | Claude writes captions/hooks/hashtags/descriptions in brand voice, per platform. |
| 8 | **Publishing + Approval** | BUILD + platform API | Per-platform `Publisher` adapters on each platform's free official API; human approval gates every publish. |
| 9 | **Long-form Video (YouTube)** | LLM + BUY | Claude scripts pain-point video; B-roll + TTS; MVP = script + storyboard + clips for human assembly. |
| 10 | **Analytics feedback** | platform API | Pull post performance back via official APIs → informs next plan. |

## 4. The core pipeline (client onboarding → published post)

```
Onboard client (website + social URLs)
      │
      ▼
[1] Brand Intelligence ──► BrandProfile (reused everywhere)
      │
      ▼
[2] Research  +  [3] Competitor  +  [4] Trends   (parallel jobs)
      │                    │                │
      └────────────────────┴────────────────┘
                           ▼
              [5] Content Planner ──► 30-day ContentPlan (ContentItem[])
                           ▼
        for each ContentItem:  [7] Copy Engine  +  [6] Creative Studio
                           ▼
               Approval queue  (draft → in_review → approved)
                           ▼
              [8] Publisher adapter ──► platform official API
                           ▼
                 [10] Analytics feedback ──► next plan
```

## 5. Creative Studio — two design paths

Behind one `CreativeProvider` interface:

- **Automated path (default, integrable):** hosted gen models, brand palette/fonts injected into prompts, templated layouts for text-heavy flyers. Runs headlessly inside the approval pipeline.
- **Designer-assisted path (Lovart AI):** strategist hands `BrandProfile` + brief to Lovart, refines on its canvas, **manually exports** the finished asset back as an `Asset` attached to a `ContentItem`. **Not** a backend integration (Lovart has no official API). Never call third-party `api.lovart.info` / `lovart.pro` endpoints.
- **Design lesson borrowed:** Lovart's specialist-agents-on-a-canvas pattern (separate logo/layout/motion agents enforcing brand consistency) is the blueprint for upgrading the automated path in Phase 3.

## 6. Publisher adapter contract

One thin adapter per platform behind a shared interface, so adding a platform = one file:

```ts
// src/lib/publishers/types.ts  (sketch — no logic yet)
export interface Publisher {
  platform: Platform;                       // 'linkedin' | 'meta' | 'youtube' | 'tiktok' | ...
  connect(account: ConnectInput): Promise<ConnectedAccount>;   // OAuth
  publish(item: PublishInput): Promise<PublishResult>;          // only 'approved' items
  fetchMetrics(ref: PostRef): Promise<AnalyticsSnapshot>;       // feedback loop
}
```

- X/Twitter intentionally **not** in MVP (paid API).
- Each adapter handles that platform's OAuth scopes, media-upload quirks, and rate limits.

## 7. Key cross-cutting concerns

- **Provider abstraction for all AI gen** (`CreativeProvider`, `LlmProvider`) so hosted ↔ self-hosted open models is a config swap (Phase 3).
- **Idempotent jobs** + dead-letter handling on the queue.
- **Secrets:** platform OAuth tokens encrypted at rest; per-tenant key scoping.
- **Observability:** structured logs + error monitoring (Sentry free tier at MVP).
