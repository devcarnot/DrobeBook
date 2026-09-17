-- CreateTable
CREATE TABLE "RentalProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "featuredImageUrl" TEXT,
    "shopifyStatus" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "rentalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "shopifyAvailable" BOOLEAN NOT NULL DEFAULT true,
    "syncError" TEXT,
    "removedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RentalProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rentalProductId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "price" TEXT,
    "inventoryItemId" TEXT,
    "inventoryQuantity" INTEGER,
    "availableInShopify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RentalProductVariant_rentalProductId_fkey" FOREIGN KEY ("rentalProductId") REFERENCES "RentalProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RentalProduct_shop_removedAt_idx" ON "RentalProduct"("shop", "removedAt");

-- CreateIndex
CREATE INDEX "RentalProduct_shop_shopifyStatus_idx" ON "RentalProduct"("shop", "shopifyStatus");

-- CreateIndex
CREATE INDEX "RentalProduct_shop_title_idx" ON "RentalProduct"("shop", "title");

-- CreateIndex
CREATE INDEX "RentalProduct_shop_updatedAt_idx" ON "RentalProduct"("shop", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RentalProduct_shop_shopifyProductId_key" ON "RentalProduct"("shop", "shopifyProductId");

-- CreateIndex
CREATE INDEX "RentalProductVariant_rentalProductId_idx" ON "RentalProductVariant"("rentalProductId");

-- CreateIndex
CREATE INDEX "RentalProductVariant_shop_sku_idx" ON "RentalProductVariant"("shop", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "RentalProductVariant_shop_shopifyVariantId_key" ON "RentalProductVariant"("shop", "shopifyVariantId");
