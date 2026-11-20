ALTER TABLE "BlockedDate" ADD COLUMN "appliesToPost" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BlockedDate" ADD COLUMN "appliesToPickup" BOOLEAN NOT NULL DEFAULT true;

UPDATE "BlockedDate"
SET "appliesToPickup" = false
WHERE "blockKind" = 'weekly'
  AND "productId" IS NULL
  AND "variantId" IS NULL;