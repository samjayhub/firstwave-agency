# 03 — Data Model

> Prisma schema sketch. Structure only — this documents intent; the build phase refines types/indexes.
> Mirrors `prisma/schema.prisma` in the scaffold.

## Entity relationships

```
Agency 1───* User
Agency 1───* Client
Client 1───1 BrandProfile
Client 1───* ConnectedAccount
Client 1───* Competitor 1───* CompetitorInsight
Client 1───* Trend
Client 1───* ContentPlan 1───* ContentItem
ContentItem *───* ConnectedAccount   (targets — join table)
ContentItem 1───* Asset
ContentItem 1───* PublishJob 1───* AnalyticsSnapshot
```

## Core models (sketch)

```prisma
// Tenancy ---------------------------------------------------------------
model Agency {
  id        String   @id @default(cuid())
  name      String
  users     User[]
  clients   Client[]
  createdAt DateTime @default(now())
}

model User {
  id        String   @id @default(cuid())
  agencyId  String
  agency    Agency   @relation(fields: [agencyId], references: [id])
  email     String   @unique
  role      Role     // agency_admin | strategist | client_reviewer
  createdAt DateTime @default(now())
}

enum Role { agency_admin strategist client_reviewer }

model Client {
  id           String          @id @default(cuid())
  agencyId     String
  agency       Agency          @relation(fields: [agencyId], references: [id])
  name         String
  websiteUrl   String?
  niche        String?
  brandProfile BrandProfile?
  accounts     ConnectedAccount[]
  competitors  Competitor[]
  trends       Trend[]
  plans        ContentPlan[]
  createdAt    DateTime        @default(now())
  @@index([agencyId])
}

// Brand intelligence ----------------------------------------------------
model BrandProfile {
  id          String  @id @default(cuid())
  clientId    String  @unique
  client      Client  @relation(fields: [clientId], references: [id])
  voice       Json?   // tone, themes, do/don't, audience (LLM-derived)
  palette     Json?   // [{hex, role}] from node-vibrant
  fonts       Json?   // [{family, role}] from font-face parse
  logoAssetId String?
  // voiceEmbedding  Unsupported("vector(1536)")?   // pgvector — grounding
  updatedAt   DateTime @updatedAt
}

// Connected accounts (OAuth) -------------------------------------------
model ConnectedAccount {
  id            String   @id @default(cuid())
  clientId      String
  client        Client   @relation(fields: [clientId], references: [id])
  platform      Platform
  handle        String?
  accessToken   String   // encrypted at rest
  refreshToken  String?  // encrypted at rest
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  @@index([clientId])
}

enum Platform { meta_ig meta_fb youtube linkedin tiktok pinterest x }

// Competitor intelligence ----------------------------------------------
model Competitor {
  id        String             @id @default(cuid())
  clientId  String
  client    Client             @relation(fields: [clientId], references: [id])
  platform  Platform
  handle    String
  url       String?
  insights  CompetitorInsight[]
  createdAt DateTime           @default(now())
  @@index([clientId])
}

model CompetitorInsight {
  id           String     @id @default(cuid())
  competitorId String
  competitor   Competitor @relation(fields: [competitorId], references: [id])
  metric       Json       // engagementRate, cadence, topFormats, hooks
  capturedAt   DateTime   @default(now())
}

// Trends ----------------------------------------------------------------
model Trend {
  id         String   @id @default(cuid())
  clientId   String
  client     Client   @relation(fields: [clientId], references: [id])
  platform   Platform
  topic      String
  signal     Json     // volume, growth, sampleRefs
  capturedAt DateTime @default(now())
}

// Content plan ----------------------------------------------------------
model ContentPlan {
  id        String        @id @default(cuid())
  clientId  String
  client    Client        @relation(fields: [clientId], references: [id])
  startDate DateTime
  items     ContentItem[]
  createdAt DateTime      @default(now())
}

model ContentItem {
  id          String       @id @default(cuid())
  planId      String
  plan        ContentPlan  @relation(fields: [planId], references: [id])
  scheduledAt DateTime?
  copy        Json?        // caption, hook, hashtags, description
  status      ItemStatus   @default(draft)
  assets      Asset[]
  targets     ConnectedAccount[]  // many-to-many via implicit join
  publishJobs PublishJob[]
  createdAt   DateTime     @default(now())
  @@index([planId])
}

enum ItemStatus { draft in_review approved scheduled published failed }

// Assets ----------------------------------------------------------------
model Asset {
  id            String      @id @default(cuid())
  contentItemId String?
  contentItem   ContentItem? @relation(fields: [contentItemId], references: [id])
  kind          AssetKind   // image | video | audio
  url           String      // object storage
  source        AssetSource // generated | lovart_manual | upload
  meta          Json?       // model, prompt, dimensions
  createdAt     DateTime    @default(now())
}

enum AssetKind { image video audio }
enum AssetSource { generated lovart_manual upload }

// Publishing + analytics ------------------------------------------------
model PublishJob {
  id            String       @id @default(cuid())
  contentItemId String
  contentItem   ContentItem  @relation(fields: [contentItemId], references: [id])
  platform      Platform
  externalId    String?      // returned post id
  state         PublishState @default(queued)
  error         String?
  snapshots     AnalyticsSnapshot[]
  createdAt     DateTime     @default(now())
}

enum PublishState { queued posting published failed }

model AnalyticsSnapshot {
  id           String     @id @default(cuid())
  publishJobId String
  publishJob   PublishJob @relation(fields: [publishJobId], references: [id])
  metrics      Json       // impressions, likes, comments, shares, watchTime
  capturedAt   DateTime   @default(now())
}
```

## Notes

- **`pgvector`:** the `voiceEmbedding` (and a competitor-post embedding table) use Prisma `Unsupported("vector(...)")` + a raw migration to enable the extension. Left commented in the sketch.
- **Encryption:** `accessToken`/`refreshToken` encrypted at rest (app-level), never logged.
- **Tenant safety:** all top-level queries go through a helper that injects `agencyId` — see [02-architecture.md](02-architecture.md) §2.
- **`Json` columns** are intentional for fast iteration in early phases; promote hot fields to columns once shapes stabilize.
