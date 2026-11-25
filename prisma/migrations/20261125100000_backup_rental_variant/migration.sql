-- AlterTable
ALTER TABLE "RentalProductVariant" ADD COLUMN "backupShopifyVariantId" TEXT;

-- CreateIndex
CREATE INDEX "RentalProductVariant_shop_backupShopifyVariantId_idx" ON "RentalProductVariant"("shop", "backupShopifyVariantId");