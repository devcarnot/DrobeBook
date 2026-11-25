-- CreateTable
CREATE TABLE "BackupOrderFlag" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "detailJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupOrderFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookProcessLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookProcessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackupOrderFlag_shop_shopifyOrderId_key" ON "BackupOrderFlag"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "BackupOrderFlag_shop_status_idx" ON "BackupOrderFlag"("shop", "status");

-- CreateIndex
CREATE INDEX "BackupOrderFlag_shop_createdAt_idx" ON "BackupOrderFlag"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookProcessLog_shop_topic_externalId_key" ON "WebhookProcessLog"("shop", "topic", "externalId");

-- CreateIndex
CREATE INDEX "WebhookProcessLog_shop_createdAt_idx" ON "WebhookProcessLog"("shop", "createdAt");