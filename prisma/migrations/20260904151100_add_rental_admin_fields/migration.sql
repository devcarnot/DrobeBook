ALTER TABLE "Booking" ADD COLUMN "updatedAt" DATETIME;
UPDATE "Booking" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

UPDATE "Booking" SET "workflowStatus" = 'confirmed' WHERE "status" = 'confirmed';
UPDATE "Booking" SET "workflowStatus" = 'cancelled' WHERE "status" = 'cancelled';
UPDATE "Booking" SET "workflowStatus" = 'reserved' WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "Booking_shop_workflowStatus_idx" ON "Booking"("shop", "workflowStatus");
CREATE INDEX IF NOT EXISTS "Booking_shop_createdAt_idx" ON "Booking"("shop", "createdAt");
