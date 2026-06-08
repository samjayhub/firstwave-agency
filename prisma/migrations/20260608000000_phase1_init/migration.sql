-- CreateEnum
CREATE TYPE "Role" AS ENUM ('agency_admin', 'strategist', 'client_reviewer');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('meta_ig', 'meta_fb', 'youtube', 'linkedin', 'tiktok', 'pinterest', 'x');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('draft', 'in_review', 'approved', 'scheduled', 'published', 'failed');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('image', 'video', 'audio');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('generated', 'lovart_manual', 'upload');

-- CreateEnum
CREATE TYPE "PublishState" AS ENUM ('queued', 'posting', 'published', 'failed');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "niche" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "voice" JSONB,
    "palette" JSONB,
    "fonts" JSONB,
    "logoAssetId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorInsight" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "metric" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trend" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "topic" TEXT NOT NULL,
    "signal" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "copy" JSONB,
    "status" "ItemStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "url" TEXT NOT NULL,
    "source" "AssetSource" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT,
    "state" "PublishState" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "publishJobId" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAuditLog" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT,
    "action" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConnectedAccountToContentItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");

-- CreateIndex
CREATE INDEX "Client_agencyId_idx" ON "Client"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProfile_clientId_key" ON "BrandProfile"("clientId");

-- CreateIndex
CREATE INDEX "ConnectedAccount_clientId_idx" ON "ConnectedAccount"("clientId");

-- CreateIndex
CREATE INDEX "Competitor_clientId_idx" ON "Competitor"("clientId");

-- CreateIndex
CREATE INDEX "ContentItem_planId_idx" ON "ContentItem"("planId");

-- CreateIndex
CREATE INDEX "AiAuditLog_agencyId_createdAt_idx" ON "AiAuditLog"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAuditLog_clientId_idx" ON "AiAuditLog"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "_ConnectedAccountToContentItem_AB_unique" ON "_ConnectedAccountToContentItem"("A", "B");

-- CreateIndex
CREATE INDEX "_ConnectedAccountToContentItem_B_index" ON "_ConnectedAccountToContentItem"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorInsight" ADD CONSTRAINT "CompetitorInsight_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trend" ADD CONSTRAINT "Trend_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAuditLog" ADD CONSTRAINT "AiAuditLog_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConnectedAccountToContentItem" ADD CONSTRAINT "_ConnectedAccountToContentItem_A_fkey" FOREIGN KEY ("A") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConnectedAccountToContentItem" ADD CONSTRAINT "_ConnectedAccountToContentItem_B_fkey" FOREIGN KEY ("B") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

