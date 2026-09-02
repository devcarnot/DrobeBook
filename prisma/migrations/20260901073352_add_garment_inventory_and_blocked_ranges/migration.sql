/*
  Warnings:

  - You are about to drop the column `date` on the `BlockedDate` table. All the data in the column will be lost.
  - Added the required column `endDate` to the `BlockedDate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `BlockedDate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "pricePaid" DECIMAL;

-- CreateTable
CREATE TABLE "Garment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "timesRented" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BlockedDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_BlockedDate" ("id", "productId", "reason", "shop", "variantId") SELECT "id", "productId", "reason", "shop", "variantId" FROM "BlockedDate";
DROP TABLE "BlockedDate";
ALTER TABLE "new_BlockedDate" RENAME TO "BlockedDate";
CREATE INDEX "BlockedDate_shop_productId_variantId_startDate_endDate_idx" ON "BlockedDate"("shop", "productId", "variantId", "startDate", "endDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Garment_shop_idx" ON "Garment"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Garment_shop_productId_variantId_key" ON "Garment"("shop", "productId", "variantId");
