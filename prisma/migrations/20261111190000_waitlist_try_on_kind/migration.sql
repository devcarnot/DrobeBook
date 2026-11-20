ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'garment';
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "preferredDate" TIMESTAMP(3);
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "preferredTime" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;

CREATE INDEX IF NOT EXISTS "WaitlistEntry_shop_kind_status_preferredDate_idx"
  ON "WaitlistEntry"("shop", "kind", "status", "preferredDate");
