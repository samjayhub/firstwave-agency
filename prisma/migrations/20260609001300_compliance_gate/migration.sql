-- Content safety & compliance gate (P4-09): per-agency config for the
-- pre-approval gate (banned terms + disclosure policy). Platform-policy rules
-- (caption/hashtag caps) are built-in and need no stored config.

-- CreateTable
CREATE TABLE "ComplianceSetting" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "bannedTerms" TEXT[],
    "requireDisclosure" BOOLEAN NOT NULL DEFAULT false,
    "disclosureTags" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSetting_agencyId_key" ON "ComplianceSetting"("agencyId");

-- AddForeignKey
ALTER TABLE "ComplianceSetting" ADD CONSTRAINT "ComplianceSetting_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
