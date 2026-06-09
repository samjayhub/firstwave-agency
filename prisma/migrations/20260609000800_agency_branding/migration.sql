-- Agency white-label branding (P3-06): one branding row per Agency.
-- CreateTable
CREATE TABLE "AgencyBranding" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "brandName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "supportEmail" TEXT,
    "customDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyBranding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyBranding_agencyId_key" ON "AgencyBranding"("agencyId");
CREATE UNIQUE INDEX "AgencyBranding_customDomain_key" ON "AgencyBranding"("customDomain");

-- AddForeignKey
ALTER TABLE "AgencyBranding" ADD CONSTRAINT "AgencyBranding_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
