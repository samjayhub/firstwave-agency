-- Client reviewer portal (P4-04): shareable links + threaded review comments.

-- CreateTable
CREATE TABLE "ReviewShare" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewShare_token_key" ON "ReviewShare"("token");
CREATE INDEX "ReviewShare_clientId_idx" ON "ReviewShare"("clientId");
CREATE INDEX "ReviewComment_contentItemId_idx" ON "ReviewComment"("contentItemId");

-- AddForeignKey
ALTER TABLE "ReviewShare" ADD CONSTRAINT "ReviewShare_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
