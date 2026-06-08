# 06 — Risks & Compliance

> The trade-offs the build-first model accepts, and how we mitigate them.

## 1. App review is the #1 build-it-yourself cost (time, not money)
Meta / TikTok / LinkedIn require app review (and often a registered business entity) before granting full posting API access — typically **weeks**.

**Mitigation:**
- Start the chosen MVP platform's app-review paperwork on **day 1 of Phase 1**; it runs in parallel with the build.
- Pick the single fastest-approving platform for the MVP.
- The human-approval publishing model aligns with platforms' anti-spam/automation policies, easing review.

## 2. Platform ToS / auto-posting limits
TikTok and Instagram restrict fully-automated posting; X's API is paid.

**Mitigation:** human-in-the-loop approval is already the locked model — we never post fully headless. Defer X. Respect per-account rate caps (e.g., Meta ~25 posts/24h).

## 3. We now own the scraping risk (no Apify buffer)
Scraping public data is **legal** in the US (hiQ Labs v. LinkedIn — CFAA doesn't apply to unauthenticated public data) but **breaches platform ToS** (contract risk), and we maintain proxies + anti-bot ourselves.

**Mitigation:**
- Prefer **official APIs** (YouTube Data, Google Trends) wherever they exist.
- Keep scraping **minimal and optional**; **MVP defers it entirely** (manual competitor URLs).
- Legal review before storing any personal data; documented **GDPR/CCPA retention + deletion** policy; aggregate/anonymize where possible.
- Residential proxies only introduced at scale, with rate-limiting and backoff.

## 4. AI "slop" / off-brand creative
Generated content can be generic or off-voice.

**Mitigation:** ground every generation in the `BrandProfile`; the human approval gate; benchmark against competitor insights so output is differentiated, not average.

## 5. Maintenance burden of in-house adapters
Platform APIs change; we own every adapter (the trade for killing the aggregator fee).

**Mitigation:** one thin adapter per platform behind a shared `Publisher` interface; integration tests per adapter; alerting on publish failures via the job queue's dead-letter handling.

## 6. AI compute is the irreducible cost
We can't make generation free.

**Mitigation:** abstract all generation behind provider interfaces; start on cheap hosted tiers; move to self-hosted open models (Flux/SDXL/Llama/open TTS) only when volume makes GPUs cheaper than metered calls.

## 7. Security & tenancy
Multi-tenant agency data + stored OAuth tokens.

**Mitigation:** `agencyId` row-scoping enforced centrally; OAuth tokens encrypted at rest and never logged; least-privilege scopes per platform; secret rotation.

## Compliance checklist (before go-live)
- [ ] Privacy policy + ToS published.
- [ ] Data-retention + deletion policy documented (covers any scraped data).
- [ ] Each platform's app review approved for the scopes we use.
- [ ] Business entity registered (for platform app review).
- [ ] OAuth token encryption verified; no secrets in logs.
- [ ] Rate-limit + backoff on every external call.

## Auth security decisions (Phase 1)
Documented trade-offs from the PR3 security review:
- **CSRF:** session is an `HttpOnly`, `SameSite=Lax`, `Secure`-in-prod cookie. Mutating routes additionally enforce an Origin / `Sec-Fetch-Site` same-origin check (`src/app/api/_lib/csrf.ts`). A double-submit CSRF token is a planned hardening if we add cross-subdomain surfaces.
- **Rate limiting:** login/signup are rate-limited per IP (and login per email) via an in-memory sliding window (`src/lib/security/rate-limiter.ts`). **Accepted limitation:** in-memory state is per-instance — move to the Redis-backed limiter before running more than one app instance.
- **Login enumeration:** generic error message + a dummy `verify` on the no-user branch so response timing can't reveal whether an email is registered.
- **Signup enumeration (accepted for MVP):** signup returns `409 CONFLICT` for an already-registered email, which reveals existence. Accepted for agency-onboarding UX; revisit with an email-verification flow if self-serve signup is opened broadly.
- **Email uniqueness (follow-up):** uniqueness is global and enforced via app-level lowercase normalization; the DB column is not yet `citext`. Add a normalized unique index (or `citext`) so isolation does not depend solely on callers normalizing.
- **Password hashing:** scrypt (node built-in), constant-time verify. Explicit cost parameters + a self-describing hash format are a planned follow-up to enable tuning/rotation.
