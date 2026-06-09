-- Public API + webhooks (P4-08): per-agency bearer keys + outbound webhooks.

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");
CREATE INDEX "ApiKey_agencyId_idx" ON "ApiKey"("agencyId");
CREATE INDEX "Webhook_agencyId_idx" ON "Webhook"("agencyId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
