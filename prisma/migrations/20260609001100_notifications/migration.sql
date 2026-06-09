-- Notifications & alerts (P4-06): in-app feed + per-agency delivery settings.

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('approval_requested', 'publish_failed', 'metric_milestone');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "slackWebhookUrl" TEXT,
    "emailTo" TEXT,
    "mutedKinds" "NotificationKind"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_agencyId_createdAt_idx" ON "Notification"("agencyId", "createdAt");
CREATE UNIQUE INDEX "NotificationSetting_agencyId_key" ON "NotificationSetting"("agencyId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
