# 00 — Overview

> Strategy + architecture spec for an agency-grade AI social-media marketing platform.
> Phase 0 deliverable. No application logic yet — this is the blueprint the build phase executes against.

## The problem

Marketing agencies repeat the same manual loop for every client:

1. Understand the brand (voice, visual identity).
2. Research the niche.
3. Study the best competitors across platforms (incl. YouTube).
4. Find what's trending.
5. Plan a month of content.
6. Design the creative (flyers, short video).
7. Write the copy.
8. Publish across platforms.

Existing tools solve *one slice* well but none chain the **whole loop**. The few that try (Ocoya, Predis.ai) have shallow brand understanding and weak competitor reverse-engineering. See [01-competitive-analysis.md](01-competitive-analysis.md).

## What we're building

An agency onboards a client by pointing the platform at their **website + social pages**. The platform then:

1. **Extracts** the brand's voice + visual identity (colors, fonts, logo, tone).
2. **Researches** the niche and discovers best-performing competitors across platforms, incl. YouTube.
3. **Reverse-engineers** what's working and produces a *better*, brand-aligned version.
4. **Tracks** live trends across platforms.
5. **Generates** a 30-day content plan.
6. **Produces** the creative (image flyers + short video) and the copy/descriptions.
7. **Routes** everything through **human approval** before scheduled multi-platform publishing.

## Who it's for

A **marketing agency managing many clients** — multi-tenant from day one. Each client has its own brand profile, connected accounts, competitor set, and content calendar. Roles: agency admin, strategist, client-reviewer.

## Locked decisions

| Decision | Choice |
|---|---|
| First deliverable | This spec + repo scaffold (no app logic yet) |
| Target user | Agency, multi-client (multi-tenant) |
| Publishing model | **Human-in-the-loop** — AI drafts + schedules, a person approves, then publish |
| Tech stack | **Next.js + TypeScript** full-stack |
| Build philosophy | **Build-first / own-it** — build everything that is "just software" in-house; pay only for what's structurally impossible to build (the platforms' own APIs + metered AI compute) |

## The wedge

No competitor connects all four of:

1. One-click **brand extraction** → voice + visual kit.
2. Cross-platform **competitor reverse-engineering** of what actually performs.
3. **Brand-aligned content + creative** generation positioned against those competitors.
4. **Approval + multi-platform publishing.**

…at agency/mid-market pricing. That integrated loop is the product.

## Document map

| Doc | Contents |
|---|---|
| [01-competitive-analysis.md](01-competitive-analysis.md) | Full 20+ tool teardown with sources |
| [02-architecture.md](02-architecture.md) | System + module architecture |
| [03-data-model.md](03-data-model.md) | Prisma data model sketch |
| [04-integrations.md](04-integrations.md) | Build-vs-buy, official-API auth flows, cost model |
| [05-roadmap.md](05-roadmap.md) | Phased plan + MVP cut line |
| [06-risks-and-compliance.md](06-risks-and-compliance.md) | App-review, ToS/scraping, privacy |
