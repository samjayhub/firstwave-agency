-- Media library (P4-10): browse / reuse / version / lifecycle generated Assets
-- across a client. Adds the dedupe key (contentHash), version-group columns, and
-- a soft-archive timestamp for retention, plus the `reused` asset source.

-- AlterEnum
ALTER TYPE "AssetSource" ADD VALUE 'reused';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Asset" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Asset_groupId_idx" ON "Asset"("groupId");
CREATE INDEX "Asset_contentHash_idx" ON "Asset"("contentHash");
