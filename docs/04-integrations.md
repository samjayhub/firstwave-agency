# 04 — Integrations, Build-vs-Buy & Cost

> The build-first decision in full: what we own, what we depend on, the official-API auth flows, and every cost.

## 1. Build vs Buy

**Principle:** build everything that is just software; pay only for what is structurally impossible to build. This drops recurring SaaS fees from ~$200+/mo (Ayrshare + Brandfetch + Apify) to ~$0.

### ✅ BUILD ourselves (no recurring fee — our code + hosting)

| Capability | What we build | Replaces | How |
|---|---|---|---|
| SaaS app | Next.js + Postgres | — | dashboard, multi-tenant, auth, billing, calendar, approval |
| Brand kit extraction | `lib/brand-intel/` | **Brandfetch** | Playwright crawl → `node-vibrant` palette + `@font-face` parse + largest-logo heuristic + LLM voice |
| Competitor & trend data | `lib/competitor/`, `lib/trends/` | **Apify** | free official APIs (YouTube Data, Google Trends public) + own scrapers |
| Strategy / planning / copy | `lib/planner/`, `lib/copy/` | Jasper et al. | prompt orchestration over an LLM |
| Publishing | `lib/publishers/` | **Ayrshare** | one adapter per platform on each platform's free official API |

### 💸 BUY / depend on — can't be built (structural)

| Capability | Why unavoidable | Cost shape | MVP choice |
|---|---|---|---|
| Social platforms | Can't build IG/YouTube/etc.; must call their APIs | **APIs free**; cost = dev time + app-review weeks. **X API paid** | direct official APIs; **defer X** |
| LLM | Can't train a frontier model | per-token (cents/client) **or** self-host open-weight on GPU | hosted API |
| Image generation | Can't train Flux/Imagen | ~$0.02–0.15/img hosted **or** self-host Flux/SDXL | cheap hosted |
| Video generation | Can't train Veo/Sora | ~$0.03–0.50/sec hosted **or** self-host | hosted, low tier; **defer to Phase 3** |
| Voiceover | TTS quality | metered (ElevenLabs) **or** self-host open TTS | hosted |

**Self-host lever:** every BUY row has an open-source escape hatch (Flux/SDXL, Llama, open TTS) that trades per-call fees for your own GPU cost. At MVP volume hosted is cheaper + simpler; revisit once volume makes GPUs cheaper. All generation sits behind one provider interface so the swap is config.

## 2. Social platform publishing APIs (the "buy that's free")

| Platform | Official API | Auto-post? | Requirements / gotchas |
|---|---|---|---|
| Instagram / Facebook | Meta Graph API (Content Publishing) | Yes (business/creator accounts) | App Review; Business account; long-lived tokens; ~25 posts/24h/account |
| YouTube | Data API v3 (videos.insert) | Yes | OAuth; **10k quota units/day** (upload ~1600 units); quota-increase request to scale |
| LinkedIn | Posts/Marketing API | Yes | Partner/app review; member + org scopes |
| TikTok | Content Posting API | Direct post **or** upload-as-draft | Audit required for public posts; sandbox starts private |
| Pinterest | Pinterest API | Yes | App approval |
| X / Twitter | API v2 | Yes | **Paid** ($100+/mo basic) → **deferred** |

**MVP:** integrate **one** platform whose app review is fastest in practice (LinkedIn or Meta Graph). Each adapter implements the `Publisher` contract in [02-architecture.md](02-architecture.md) §6.

### OAuth flow (per platform, generic)
```
User clicks "Connect <platform>"
  → redirect to platform OAuth consent (scopes for publish + read insights)
  → callback with auth code
  → exchange for access (+ refresh) token
  → store encrypted on ConnectedAccount
  → background refresh before expiry
```

## 3. AI generation providers (the "buy that's metered")

| Job | MVP provider | Note |
|---|---|---|
| LLM (plan/copy/voice analysis) | Claude (Anthropic SDK) | best long-form brand-voice writing |
| Image — drafts | Imagen 4 Fast (~$0.02/img) | cheapest quality |
| Image — text-heavy flyers | Ideogram v3 / Nano Banana 2 (~$0.04–0.15/img) | best **in-image text** rendering |
| Video (Phase 3) | Veo 3.1 Fast / Sora 2 (~$0.03–0.50/sec) | the one pricey item; deferred |
| Voiceover | ElevenLabs | metered |

All behind `CreativeProvider` / `LlmProvider` interfaces → swappable to self-hosted open models later.

## 4. In-house data sources (the "build instead of Apify")

| Source | Access | Cost |
|---|---|---|
| YouTube competitor discovery | Data API v3 search/channels | free quota |
| Google Trends | public endpoints | ~free |
| TikTok Creative Center trends | own scraper | proxies *only at scale* |
| IG/TikTok/LinkedIn competitor posts | own scrapers | **deferred** in MVP (manual URLs) — see [06-risks-and-compliance.md](06-risks-and-compliance.md) |

## 5. Cost model — every cost, not just hosting

**Replaced to $0:** Ayrshare ($149+), Brandfetch, Apify ($29+) — all become our code.

- **A. Hosting / infra (flat, whole platform):** server + Postgres + Redis + object storage ≈ **$20–100/mo** (e.g., Vercel/Fly + managed Postgres + R2).
- **B. AI compute (metered, per client/mo):** LLM plan+copy ≈ low single digits; ~30 images ≈ **$1–5**; video+TTS deferred. **MVP ≈ a few $/client/mo** — the irreducible floor.
- **C. Small fixed bits (free-tier at MVP):** domain ~**$12/yr**; transactional email (Resend/Postmark) free → ~$10–20/mo later; error monitoring (Sentry) free; SSL free.
- **D. Deferred / optional:** **X API** ~$100+/mo; **residential proxies** ~$50–500/mo *only at scale* (MVP = manual URLs = $0); **GPU rental** only if self-hosting later.
- **E. Non-vendor but real:** business entity registration (for Meta/TikTok/LinkedIn app review); Stripe ~2.9%+30¢ per transaction *only when billing clients*; legal (privacy policy / ToS).

**Bottom line:** beyond hosting, the only material MVP cost is **metered AI compute (a few $/client/mo).** Everything else is pocket change, deferred, or optional.

## 6. Environment variables

See `.env.example` in the repo root. Notably **absent:** any Ayrshare / Brandfetch / Apify keys.
