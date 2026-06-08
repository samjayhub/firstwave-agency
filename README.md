# AI Social Media Marketing Platform

Agency-grade platform that runs the whole social loop per client: **extract the brand → reverse-engineer the niche's best competitors → generate a brand-aligned 30-day plan + creative + copy → human approval → multi-platform publishing.**

> **Status: Phase 0 — spec + scaffold.** This repo currently contains the architecture spec (`docs/`) and a structural skeleton. **No business logic is implemented yet.** Stubs are marked `// TODO(phase-1)`.

## Why this exists

Existing tools each solve one slice (creation, or scheduling, or competitor listening) — none chain the whole loop, and the ones that try have shallow brand understanding. Full landscape: [docs/01-competitive-analysis.md](docs/01-competitive-analysis.md).

## Core decisions

- **Users:** marketing agencies, multi-client (multi-tenant).
- **Publishing:** human-in-the-loop — AI drafts + schedules, a person approves, then publish.
- **Stack:** Next.js (App Router) + TypeScript, Postgres/Prisma, Redis/BullMQ, object storage.
- **Build-first:** build everything that's "just software" in-house; pay only for the platforms' own APIs (free) + metered AI compute. Recurring third-party SaaS ≈ $0. Details: [docs/04-integrations.md](docs/04-integrations.md).

## Documentation

| Doc | Contents |
|---|---|
| [docs/00-overview.md](docs/00-overview.md) | Vision, users, scope, decisions |
| [docs/01-competitive-analysis.md](docs/01-competitive-analysis.md) | Competitor teardown + sources |
| [docs/02-architecture.md](docs/02-architecture.md) | System + module architecture |
| [docs/03-data-model.md](docs/03-data-model.md) | Prisma data model |
| [docs/04-integrations.md](docs/04-integrations.md) | Build-vs-buy, APIs, cost model |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Phased plan + MVP cut |
| [docs/06-risks-and-compliance.md](docs/06-risks-and-compliance.md) | App-review, ToS, privacy |

## Project layout

```
docs/                     # the spec (read these first)
prisma/schema.prisma      # data model sketch
src/
  app/                    # Next.js App Router (dashboard + API route handlers)
  lib/
    brand-intel/          # in-house brand extraction (replaces Brandfetch)
    competitor/           # competitor discovery/reverse-engineering (replaces Apify)
    trends/               # trend detection
    planner/              # 30-day content plan
    copy/                 # copywriting
    creative/             # image/video generation provider interface
    publishers/           # one adapter per platform on official APIs (replaces Ayrshare)
    llm/                  # LLM provider interface
    queue/                # BullMQ job definitions
```

## Getting started (build phase)

```bash
npm install
cp .env.example .env.local   # fill in keys (see docs/04-integrations.md §6)
npx prisma migrate dev
npm run dev
```

## Cost at a glance

Beyond hosting (~$20–100/mo) the only material cost is **metered AI compute, a few $/client/mo.** No Ayrshare/Brandfetch/Apify subscriptions. Full breakdown: [docs/04-integrations.md](docs/04-integrations.md) §5.

## Roadmap

Phase 1 MVP = the core loop on **one** platform, all in-house. See [docs/05-roadmap.md](docs/05-roadmap.md).
